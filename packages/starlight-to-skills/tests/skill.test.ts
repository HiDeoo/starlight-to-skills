import fs from 'node:fs/promises'

import { describe, expect } from 'vitest'

import { approveCandidate, createCandidate } from '../src/libs/candidate'
import { computeSkillFileDigest, GeneratorVersion } from '../src/libs/digest'
import type { SkillConfiguration } from '../src/libs/loader'
import {
  approveSkill,
  discoverSkillDefinitions,
  discoverSkillManifests,
  getSkillDefinitionUrlByName,
  loadSkill,
  pruneSkill,
} from '../src/libs/skill'
import type { StarlightToSkillsConfig } from '../src/schemas/config'
import type { SkillDigest } from '../src/schemas/digest'
import type { SkillManifest } from '../src/schemas/manifest'

import { test, type TestProject } from './project'

const rootDir = new URL('fixtures/', import.meta.url)

describe('discoverSkillDefinitions', () => {
  test('discovers skill definitions', async () => {
    const definitionUrls = await discoverSkillDefinitions({ definitionsDir: rootDir })

    expect(definitionUrls).toStrictEqual([
      new URL('skill-invalid.skill.ts', rootDir),
      new URL('skill-no-default.skill.ts', rootDir),
      new URL('skill-valid.skill.ts', rootDir),
    ])
  })

  test('ignores non-skill and nested definition files', async ({ project }) => {
    const definitionsDir = new URL('definitions/', project.rootDir)

    await project.write('definitions/test.skill.ts', 'export default {}')
    await project.write('definitions/other.ts', 'export default {}')
    await project.write('definitions/nested/nested.skill.ts', 'export default {}')

    await expect(discoverSkillDefinitions({ definitionsDir })).resolves.toStrictEqual([
      new URL('test.skill.ts', definitionsDir),
    ])
  })

  test('returns an empty list of definitions when no matches are found', async () => {
    const definitionUrls = await discoverSkillDefinitions({ definitionsDir: new URL('unknown/', rootDir) })

    expect(definitionUrls).toStrictEqual([])
  })
})

describe('getSkillDefinitionUrlByName', () => {
  test('returns a skill definition URL', () => {
    const definitionUrl = new URL('skill-valid.skill.ts', rootDir)

    const url = getSkillDefinitionUrlByName([definitionUrl, new URL('skill-invalid.skill.ts', rootDir)], 'skill-valid')

    expect(url).toBe(definitionUrl)
  })

  test('rejects an unknown skill name', () => {
    expect(() => getSkillDefinitionUrlByName([], 'unknown')).toThrowErrorMatchingInlineSnapshot(
      `
      No skill definition found for 'unknown'.

      Hint: Check the skill name or create 'unknown.skill.ts'.
    `,
    )
  })

  test('rejects an invalid requested skill name', () => {
    expect(() => getSkillDefinitionUrlByName([], 'invalid--name')).toThrowErrorMatchingInlineSnapshot(
      `
      Invalid skill name 'invalid--name'.

      Hint: Use 1-64 lowercase letters, numbers, or hyphens, without leading, trailing, or consecutive hyphens.
    `,
    )
  })

  test('ignores unrelated definitions with invalid names', () => {
    const definitionUrl = new URL('skill-valid.skill.ts', rootDir)

    expect(
      getSkillDefinitionUrlByName([new URL('invalid--name.skill.ts', rootDir), definitionUrl], 'skill-valid'),
    ).toBe(definitionUrl)
  })
})

describe('discoverSkillManifests', () => {
  test('rejects when skill manifests cannot be discovered', async ({ project }) => {
    const outputDir = new URL('skills/', project.rootDir)

    await fs.mkdir(outputDir, { recursive: true })
    await project.write('skills/.starlight-to-skills', 'not a directory')

    await expect(discoverSkillManifests(outputDir)).rejects.toThrow(/Failed to find approved skills./)
  })
})

describe('loadSkill', () => {
  let project: TestProject
  let outputDir: URL
  let skillUrl: URL

  const files = [
    { path: 'SKILL.md', content: 'Skill content.\n' },
    { path: 'references/details.md', content: 'Reference content.\n' },
  ]

  const manifest: SkillManifest = {
    schemaVersion: 1,
    generatorVersion: GeneratorVersion,
    model: 'openai/gpt-5.6-luna',
    name: 'test-skill',
    inputHash: 'input-hash',
    definitionHash: 'definition-hash',
    docs: [{ path: './guide.md', contentHash: 'doc-hash' }],
    files: computeSkillFileDigest(files),
  }

  test.beforeEach(async ({ project: testProject }) => {
    project = testProject
    outputDir = new URL('skills/', project.rootDir)
    skillUrl = new URL('test-skill/', outputDir)

    await Promise.all([
      ...files.map((file) => project.write(`skills/test-skill/${file.path}`, file.content)),
      project.write('skills/.starlight-to-skills/test-skill.json', JSON.stringify(manifest, undefined, 2)),
    ])
  })

  test('loads a skill', async () => {
    await expect(loadSkill(outputDir, 'test-skill')).resolves.toStrictEqual({ manifest, files, fileMismatches: [] })
  })

  test('rejects an approved skill with a mismatched name', async () => {
    await project.write(
      'skills/.starlight-to-skills/test-skill.json',
      JSON.stringify({ ...manifest, name: 'other-skill' }, undefined, 2),
    )

    await expect(loadSkill(outputDir, 'test-skill')).rejects.toThrowErrorMatchingInlineSnapshot(`
      Failed to load approved skill 'test-skill'.

      Expected approved skill name 'test-skill' but found 'other-skill'.
    `)
  })

  test('normalizes line endings', async () => {
    await project.write('skills/test-skill/SKILL.md', 'Skill content.\r\n')

    await expect(loadSkill(outputDir, 'test-skill')).resolves.toStrictEqual({
      manifest,
      files: [
        { path: 'SKILL.md', content: 'Skill content.\r\n' },
        { path: 'references/details.md', content: 'Reference content.\n' },
      ],
      fileMismatches: [],
    })
  })

  test('reports an updated file', async () => {
    await project.write('skills/test-skill/references/details.md', 'Updated reference content.')

    await expect(loadSkill(outputDir, 'test-skill')).resolves.toStrictEqual({
      manifest,
      files: [
        { path: 'SKILL.md', content: 'Skill content.\n' },
        { path: 'references/details.md', content: 'Updated reference content.' },
      ],
      fileMismatches: ['references/details.md'],
    })
  })

  test('reports a missing file', async () => {
    await fs.rm(new URL('references/details.md', skillUrl))

    await expect(loadSkill(outputDir, 'test-skill')).resolves.toStrictEqual({
      manifest,
      files: [{ path: 'SKILL.md', content: 'Skill content.\n' }],
      fileMismatches: ['references/details.md'],
    })
  })

  test('reports a non-file entry', async () => {
    const fileUrl = new URL('references/details.md', skillUrl)

    await fs.rm(fileUrl)
    await fs.mkdir(fileUrl)

    await expect(loadSkill(outputDir, 'test-skill')).resolves.toStrictEqual({
      manifest,
      files: [{ path: 'SKILL.md', content: 'Skill content.\n' }],
      fileMismatches: ['references/details.md'],
    })
  })

  test('rejects an invalid manifested path', async () => {
    const invalidManifest = {
      ...manifest,
      files: [...manifest.files, { path: '../outside.md', contentHash: 'outside-hash' }],
    }

    await project.write('skills/.starlight-to-skills/test-skill.json', JSON.stringify(invalidManifest, undefined, 2))

    await expect(loadSkill(outputDir, 'test-skill')).rejects.toThrowErrorMatchingInlineSnapshot(`
      Failed to load approved skill 'test-skill'.

      ✖ Invalid generated skill file path '../outside.md'.
        → at files[2].path
    `)
  })
})

describe('approveSkill', () => {
  let project: TestProject
  let config: StarlightToSkillsConfig
  let skill: SkillConfiguration

  const candidate = createCandidate('input-hash', [
    {
      path: 'SKILL.md',
      content: `---\nname: "test-skill"\ndescription: "Migrate a project to v2."\nlicense: "MIT"\n---\n\nSkill content.`,
    },
  ])

  const digest: SkillDigest = {
    inputHash: 'input-hash',
    definitionHash: 'definition-hash',
    docs: [{ path: './guide.md', contentHash: 'doc-hash' }],
  }

  test.beforeEach(({ project: testProject }) => {
    project = testProject
    config = {
      model: 'openai/gpt-5.6-luna',
      url: new URL('starlight-to-skills.config.ts', project.rootDir),
      rootDir: project.rootDir,
      dataDir: new URL('.starlight-to-skills/', project.rootDir),
      definitionsDir: new URL('src/skills/', project.rootDir),
      outputDir: new URL('skills/', project.rootDir),
    }

    skill = {
      name: 'test-skill',
      url: new URL('src/skills/test-skill.skill.ts', project.rootDir),
      description: 'Migrate a project to v2.',
      docs: ['./guide.md'],
      license: 'MIT',
    }
  })

  test('approves an existing skill', async () => {
    await approveCandidate(config, skill, digest, candidate)

    const manifestPath = 'skills/.starlight-to-skills/test-skill.json'

    const contentBefore = await project.read('skills/test-skill/SKILL.md')
    const manifestBefore = JSON.parse(await project.read(manifestPath)) as SkillManifest

    const updatedConfig = { ...config, model: 'openai/gpt-5.6-terra' }
    const updatedSkill = { ...skill, guidance: 'Keep the existing migration sequence.' }
    const updatedDigest = {
      inputHash: 'updated-input-hash',
      definitionHash: 'updated-definition-hash',
      docs: [{ path: './guide.md', contentHash: 'updated-doc-hash' }],
    }

    await approveSkill(updatedConfig, updatedSkill, updatedDigest)

    await expect(project.read('skills/test-skill/SKILL.md')).resolves.toBe(contentBefore)

    const manifest = JSON.parse(await project.read(manifestPath)) as SkillManifest

    expect(manifest).toStrictEqual({
      schemaVersion: manifestBefore.schemaVersion,
      generatorVersion: GeneratorVersion,
      model: 'openai/gpt-5.6-terra',
      name: manifestBefore.name,
      ...updatedDigest,
      files: candidate.fileDigests,
    })
  })

  test('rejects approving an existing skill after a description change', async () => {
    await approveCandidate(config, skill, digest, candidate)

    const manifestPath = 'skills/.starlight-to-skills/test-skill.json'

    const contentBefore = await project.read('skills/test-skill/SKILL.md')
    const manifestBefore = await project.read(manifestPath)

    await expect(
      approveSkill(
        config,
        { ...skill, description: 'Migrate a project to v3.' },
        { ...digest, inputHash: 'updated-input-hash', definitionHash: 'updated-definition-hash' },
      ),
    ).rejects.toMatchInlineSnapshot(`
      Description, license, compatibility, or metadata for 'test-skill' has changed.

      Hint: Run 'pnpm exec starlight-to-skills generate test-skill'.
    `)

    await expect(project.read('skills/test-skill/SKILL.md')).resolves.toBe(contentBefore)

    await expect(project.read(manifestPath)).resolves.toBe(manifestBefore)
  })

  test.for([
    { approvedLicense: undefined, currentLicense: 'MIT' },
    { approvedLicense: 'MIT', currentLicense: 'Apache-2.0' },
    { approvedLicense: 'MIT', currentLicense: undefined },
  ])(
    'rejects approving an existing skill when its license changes from $approvedLicense to $currentLicense',
    async ({ approvedLicense, currentLicense }) => {
      const license = approvedLicense === undefined ? '' : `\nlicense: ${JSON.stringify(approvedLicense)}`

      const approvedCandidate = createCandidate('input-hash', [
        {
          path: 'SKILL.md',
          content: `---\nname: "test-skill"\ndescription: "Migrate a project to v2."${license}\n---\n\nSkill content.`,
        },
      ])

      await approveCandidate(config, { ...skill, license: approvedLicense }, digest, approvedCandidate)

      await expect(
        approveSkill(
          config,
          { ...skill, license: currentLicense },
          { ...digest, inputHash: 'updated-input-hash', definitionHash: 'updated-definition-hash' },
        ),
      ).rejects.toMatchInlineSnapshot(`
        Description, license, compatibility, or metadata for 'test-skill' has changed.

        Hint: Run 'pnpm exec starlight-to-skills generate test-skill'.
      `)
    },
  )
})

describe('pruneSkill', () => {
  let project: TestProject
  let outputDir: URL

  test.beforeEach(({ project: testProject }) => {
    project = testProject
    outputDir = new URL('skills/', project.rootDir)
  })

  test('deletes a skill and its manifest', async () => {
    await project.write('skills/test-skill/SKILL.md', 'Skill content.')
    await project.write('skills/test-skill/references/details.md', 'Reference content.')
    await project.write('skills/.starlight-to-skills/test-skill.json', '{}')

    await project.write('skills/other-skill/SKILL.md', 'Other skill content.')
    await project.write('skills/.starlight-to-skills/other-skill.json', '{}')

    await pruneSkill(outputDir, 'test-skill')

    await expect(project.exists('skills/test-skill')).resolves.toBe(false)
    await expect(project.exists('skills/.starlight-to-skills/test-skill.json')).resolves.toBe(false)

    await expect(project.read('skills/other-skill/SKILL.md')).resolves.toBe('Other skill content.')
    await expect(project.read('skills/.starlight-to-skills/other-skill.json')).resolves.toBe('{}')
  })
})

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import type { StarlightToSkillsConfig } from '../src/config'
import { approveCandidate, createCandidate } from '../src/libs/candidate'
import { computeSkillFileDigest, GeneratorVersion } from '../src/libs/digest'
import type { SkillConfiguration } from '../src/libs/loader'
import {
  approveExistingSkill,
  checkSkill,
  discoverSkillDefinitions,
  getSkillDefinitionUrlByName,
  loadSkill,
} from '../src/libs/skill'
import type { SkillDigest } from '../src/schemas/digest'
import type { SkillManifest } from '../src/schemas/manifest'

const rootDir = new URL('fixtures/', import.meta.url)

describe('discoverSkillDefinitions', () => {
  test('discovers skill definitions', async () => {
    const definitionUrls = await discoverSkillDefinitions({
      rootDir,
      definitions: '*.skill.ts',
    } as StarlightToSkillsConfig)

    expect(definitionUrls).toStrictEqual([
      new URL('skill-invalid.skill.ts', rootDir),
      new URL('skill-no-default.skill.ts', rootDir),
      new URL('skill-valid.skill.ts', rootDir),
    ])
  })

  test('returns an empty list of definitions when no matches are found', async () => {
    const definitionUrls = await discoverSkillDefinitions({
      rootDir,
      definitions: './unknown/*.skill.ts',
    } as StarlightToSkillsConfig)

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
      `[Error: Failed to find skill definition 'unknown.skill.ts'.]`,
    )
  })

  test('rejects duplicate skill names', () => {
    expect(() =>
      getSkillDefinitionUrlByName(
        [new URL('a/duplicate.skill.ts', rootDir), new URL('b/duplicate.skill.ts', rootDir)],
        'duplicate',
      ),
    ).toThrowErrorMatchingInlineSnapshot(`[Error: Found multiple skill definitions named 'duplicate.skill.ts'.]`)
  })
})

describe('loadSkill', () => {
  let testDir: string
  let outputDir: URL
  let skillUrl: URL

  const files = [
    { path: 'SKILL.md', content: 'Skill content.\n' },
    { path: 'references/details.md', content: 'Reference content.\n' },
  ]

  const manifest = {
    schemaVersion: 1,
    generatorVersion: GeneratorVersion,
    model: 'openai/gpt-5.6-luna',
    name: 'test-skill',
    inputHash: 'input-hash',
    definitionHash: 'definition-hash',
    sources: [{ docsPath: './guide.md', contentHash: 'source-hash' }],
    files: computeSkillFileDigest(files),
  } satisfies SkillManifest

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starlight-to-skills-'))
    outputDir = pathToFileURL(path.join(testDir, 'skills', path.sep))
    skillUrl = new URL('test-skill/', outputDir)

    await Promise.all([
      fs.mkdir(new URL('references/', skillUrl), { recursive: true }),
      fs.mkdir(new URL('.starlight-to-skills/', outputDir), { recursive: true }),
    ])

    await Promise.all([
      ...files.map((file) => fs.writeFile(new URL(file.path, skillUrl), file.content)),
      fs.writeFile(new URL('.starlight-to-skills/test-skill.json', outputDir), JSON.stringify(manifest, undefined, 2)),
    ])
  })

  afterEach(async () => {
    await fs.rm(testDir, { force: true, recursive: true })
  })

  test('loads a skill', async () => {
    await expect(loadSkill(outputDir, 'test-skill')).resolves.toStrictEqual({ manifest, fileMismatches: [] })
  })

  test('normalizes line endings', async () => {
    await fs.writeFile(new URL('SKILL.md', skillUrl), 'Skill content.\r\n')

    await expect(loadSkill(outputDir, 'test-skill')).resolves.toStrictEqual({ manifest, fileMismatches: [] })
  })

  test('reports an updated file', async () => {
    await fs.writeFile(new URL('references/details.md', skillUrl), 'Updated reference content.')

    await expect(loadSkill(outputDir, 'test-skill')).resolves.toStrictEqual({
      manifest,
      fileMismatches: ['references/details.md'],
    })
  })

  test('reports a missing file', async () => {
    await fs.rm(new URL('references/details.md', skillUrl))

    await expect(loadSkill(outputDir, 'test-skill')).resolves.toStrictEqual({
      manifest,
      fileMismatches: ['references/details.md'],
    })
  })

  test('reports a non-file entry', async () => {
    const fileUrl = new URL('references/details.md', skillUrl)

    await fs.rm(fileUrl)
    await fs.mkdir(fileUrl)

    await expect(loadSkill(outputDir, 'test-skill')).resolves.toStrictEqual({
      manifest,
      fileMismatches: ['references/details.md'],
    })
  })
})

describe('checkSkill', () => {
  const digest = {
    inputHash: 'input-hash',
    definitionHash: 'definition-hash',
    sources: [
      { docsPath: './guide.md', contentHash: 'guide-hash' },
      { docsPath: './reference.md', contentHash: 'reference-hash' },
    ],
  } satisfies SkillDigest

  const manifest = {
    schemaVersion: 1,
    generatorVersion: GeneratorVersion,
    model: 'openai/gpt-5.6-luna',
    name: 'test-skill',
    ...digest,
    files: [{ path: 'SKILL.md', contentHash: 'skill-hash' }],
  } satisfies SkillManifest

  test('checks a current skill', () => {
    const result = checkSkill(manifest, digest, manifest.model, [])

    expect(result).toStrictEqual({ current: true })
  })

  test.for([
    {
      change: 'added source',
      sources: [...digest.sources, { docsPath: './new.md', contentHash: 'new-hash' }],
    },
    {
      change: 'removed source',
      sources: digest.sources.slice(0, 1),
    },
    {
      change: 'renamed source',
      sources: digest.sources.map((source, index) => (index === 0 ? { ...source, docsPath: './renamed.md' } : source)),
    },
    {
      change: 'reordered sources',
      sources: digest.sources.toReversed(),
    },
  ])('reports a definition change - $change', ({ sources }) => {
    const result = checkSkill(
      manifest,
      { ...digest, definitionHash: 'new-definition-hash', sources },
      manifest.model,
      [],
    )

    expect(result).toStrictEqual({ current: false, issues: [{ type: 'definition-change' }] })
  })

  test('reports a source content change', () => {
    const result = checkSkill(
      manifest,
      {
        ...digest,
        sources: digest.sources.map((source, index) =>
          index === 0 ? { ...source, contentHash: 'changed-content-hash' } : source,
        ),
      },
      manifest.model,
      [],
    )

    expect(result).toStrictEqual({ current: false, issues: [{ type: 'source-change' }] })
  })

  test('reports a model change', () => {
    const result = checkSkill(manifest, digest, 'openai/gpt-5.6-terra', [])

    expect(result).toStrictEqual({ current: false, issues: [{ type: 'model-change' }] })
  })

  test('reports a generator version change', () => {
    const result = checkSkill({ ...manifest, generatorVersion: GeneratorVersion + 1 }, digest, manifest.model, [])

    expect(result).toStrictEqual({ current: false, issues: [{ type: 'generator-change' }] })
  })

  test('reports approved skill changes', () => {
    const result = checkSkill(manifest, digest, manifest.model, ['SKILL.md', 'references/details.md'])

    expect(result).toStrictEqual({
      current: false,
      issues: [{ type: 'approved-skill-change', paths: ['SKILL.md', 'references/details.md'] }],
    })
  })

  test('reports multiple issues', () => {
    const result = checkSkill(manifest, digest, 'openai/gpt-5.6-terra', ['SKILL.md'])

    expect(result).toStrictEqual({
      current: false,
      issues: [{ type: 'model-change' }, { type: 'approved-skill-change', paths: ['SKILL.md'] }],
    })
  })
})

describe('approveExistingSkill', () => {
  let config: StarlightToSkillsConfig
  let skill: SkillConfiguration
  let testDir: string

  const candidate = createCandidate('input-hash', [
    {
      path: 'SKILL.md',
      content: `---\nname: "test-skill"\ndescription: "Migrate a project to v2."\n---\n\nSkill content.`,
    },
  ])

  const digest = {
    inputHash: 'input-hash',
    definitionHash: 'definition-hash',
    sources: [{ docsPath: './guide.md', contentHash: 'source-hash' }],
  } satisfies SkillDigest

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starlight-to-skills-'))
    const projectDir = pathToFileURL(`${testDir}${path.sep}`)

    config = {
      model: 'openai/gpt-5.6-luna',
      definitions: './src/skills/*.skill.ts',
      url: new URL('starlight-to-skills.config.ts', projectDir),
      rootDir: projectDir,
      dataDir: new URL('.starlight-to-skills/', projectDir),
      outputDir: new URL('skills/', projectDir),
    }

    skill = {
      name: 'test-skill',
      url: new URL('src/skills/test-skill.skill.ts', projectDir),
      description: 'Migrate a project to v2.',
      docs: ['./guide.md'],
    }
  })

  afterEach(async () => {
    await fs.rm(testDir, { force: true, recursive: true })
  })

  test('approves an existing skill', async () => {
    const approvedSkillUrl = await approveCandidate(config, skill, digest, candidate)

    const manifestUrl = path.join(testDir, 'skills/.starlight-to-skills/test-skill.json')

    const contentBefore = await fs.readFile(new URL('SKILL.md', approvedSkillUrl), 'utf8')
    const manifestBefore = JSON.parse(await fs.readFile(manifestUrl, 'utf8')) as SkillManifest

    const updatedConfig = { ...config, model: 'openai/gpt-5.6-terra' }
    const updatedSkill = { ...skill, guidance: 'Keep the existing migration sequence.' }
    const updatedDigest = {
      inputHash: 'updated-input-hash',
      definitionHash: 'updated-definition-hash',
      sources: [{ docsPath: './guide.md', contentHash: 'updated-source-hash' }],
    }

    await approveExistingSkill(updatedConfig, updatedSkill, updatedDigest)

    await expect(fs.readFile(new URL('SKILL.md', approvedSkillUrl), 'utf8')).resolves.toBe(contentBefore)

    const manifest = JSON.parse(await fs.readFile(manifestUrl, 'utf8')) as SkillManifest

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
    const approvedSkillUrl = await approveCandidate(config, skill, digest, candidate)

    const manifestUrl = path.join(testDir, 'skills/.starlight-to-skills/test-skill.json')

    const contentBefore = await fs.readFile(new URL('SKILL.md', approvedSkillUrl), 'utf8')
    const manifestBefore = await fs.readFile(manifestUrl, 'utf8')

    await expect(
      approveExistingSkill(
        config,
        { ...skill, description: 'Migrate a project to v3.' },
        { ...digest, inputHash: 'updated-input-hash', definitionHash: 'updated-definition-hash' },
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: The description for skill 'test-skill' has changed. Run 'starlight-to-skills generate test-skill' first.]`,
    )

    await expect(fs.readFile(new URL('SKILL.md', approvedSkillUrl), 'utf8')).resolves.toBe(contentBefore)

    await expect(fs.readFile(manifestUrl, 'utf8')).resolves.toBe(manifestBefore)
  })
})

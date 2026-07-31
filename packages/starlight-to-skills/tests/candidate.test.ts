import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect } from 'vitest'

import {
  approveCandidate,
  createCandidate,
  loadCandidate,
  removeCandidateForInput,
  writeCandidate,
} from '../src/libs/candidate'
import type { SkillFile } from '../src/libs/content'
import { GeneratorVersion } from '../src/libs/digest'
import type { SkillConfiguration } from '../src/libs/loader'
import type { StarlightToSkillsConfig } from '../src/schemas/config'
import type { SkillDigest } from '../src/schemas/digest'
import type { SkillManifest } from '../src/schemas/manifest'

import { test, type TestProject } from './project'

describe('createCandidate', () => {
  test('creates a candidate', () => {
    const files: SkillFile[] = [
      { path: 'SKILL.md', content: 'Skill content.' },
      { path: 'references/details.md', content: 'Reference content.' },
    ]

    const candidate = createCandidate('input-hash', files)

    expect(candidate.inputHash).toBe('input-hash')
    expect(candidate.files).toStrictEqual(files)

    expect(candidate.fileDigests).toHaveLength(2)
    expect(candidate.fileDigests[0]?.path).toBe('SKILL.md')
    expect(candidate.fileDigests[0]?.contentHash).toBeSha256()
    expect(candidate.fileDigests[1]?.path).toBe('references/details.md')
    expect(candidate.fileDigests[1]?.contentHash).toBeSha256()
  })

  test('validates files before creating a candidate', () => {
    expect(() =>
      createCandidate('input-hash', [
        { path: 'SKILL.md', content: 'Skill content.' },
        { path: 'README.md', content: 'Invalid content.' },
      ]),
    ).toThrow("Invalid generated skill file path 'README.md'.")
  })
})

describe('persistence', () => {
  let project: TestProject
  let dataDir: URL

  test.beforeEach(({ project: testProject }) => {
    project = testProject
    dataDir = new URL('.starlight-to-skills/', project.rootDir)
  })

  describe('writeCandidate', () => {
    test('writes a candidate', async () => {
      const candidate = createCandidate('input-hash', [
        { path: 'SKILL.md', content: 'Skill content.' },
        { path: 'references/details.md', content: 'Reference content.' },
      ])

      await writeCandidate(dataDir, 'test-skill', candidate)

      await expect(project.read('.starlight-to-skills/test-skill/SKILL.md')).resolves.toMatchInlineSnapshot(
        `"Skill content."`,
      )
      await expect(
        project.read('.starlight-to-skills/test-skill/references/details.md'),
      ).resolves.toMatchInlineSnapshot(`"Reference content."`)

      await expect(project.read('.starlight-to-skills/test-skill/manifest.json')).resolves.toMatchInlineSnapshot(`
      "{
        "inputHash": "input-hash",
        "files": [
          {
            "path": "SKILL.md",
            "contentHash": "4f617e8c6b6cb9d5d84a0c353fdd099d4f4bad614f147d630d5c8f59710f3ac7"
          },
          {
            "path": "references/details.md",
            "contentHash": "17ca47bed9dce9211b8b2be4afe52f0f3ca0f48cf613d400b800a5ad45b27e6a"
          }
        ]
      }"
    `)
    })

    test('replaces a candidate', async () => {
      await writeCandidate(
        dataDir,
        'test-skill',
        createCandidate('old-input-hash', [
          { path: 'SKILL.md', content: 'Old skill content.' },
          { path: 'references/deprecated.md', content: 'Deprecated reference content.' },
        ]),
      )

      const candidate = createCandidate('new-input-hash', [{ path: 'SKILL.md', content: 'New skill content.' }])

      await writeCandidate(dataDir, 'test-skill', candidate)

      await expect(project.read('.starlight-to-skills/test-skill/SKILL.md')).resolves.toMatchInlineSnapshot(
        `"New skill content."`,
      )

      await expect(project.exists('.starlight-to-skills/test-skill/references/deprecated.md')).resolves.toBe(false)

      await expect(project.read('.starlight-to-skills/test-skill/manifest.json')).resolves.toMatchInlineSnapshot(`
      "{
        "inputHash": "new-input-hash",
        "files": [
          {
            "path": "SKILL.md",
            "contentHash": "2274d90dd327ae9fd62e4d37cb035ea8d90fdce7f6190486b8eb730924001612"
          }
        ]
      }"
    `)
    })

    test('writes and loads reference filenames containing URL-reserved characters', async () => {
      const referencePath = 'references/Reference Guide_v2.1 #1.md'
      const candidate = createCandidate('input-hash', [
        { path: 'SKILL.md', content: 'Skill content.' },
        { path: referencePath, content: 'Reference content.' },
      ])

      await writeCandidate(dataDir, 'test-skill', candidate)

      await expect(project.read(`.starlight-to-skills/test-skill/${referencePath}`)).resolves.toBe('Reference content.')

      await expect(loadCandidate(dataDir, 'test-skill', 'input-hash')).resolves.toStrictEqual(candidate)
    })

    test('rejects invalid paths', async () => {
      await writeCandidate(
        dataDir,
        'test-skill',
        createCandidate('old-input-hash', [{ path: 'SKILL.md', content: 'Old skill content.' }]),
      )
      const candidate = createCandidate('new-input-hash', [{ path: 'SKILL.md', content: 'New skill content.' }])

      const [file] = candidate.files
      expect.assert(file)
      file.path = '../outside.md'

      await expect(writeCandidate(dataDir, 'test-skill', candidate)).rejects.toThrow(
        "Invalid generated skill file path '../outside.md'.",
      )

      await expect(project.read('.starlight-to-skills/test-skill/SKILL.md')).resolves.toBe('Old skill content.')
    })
  })

  describe('loadCandidate', () => {
    test('loads a candidate', async () => {
      const candidate = createCandidate('input-hash', [
        { path: 'SKILL.md', content: 'Skill content.' },
        { path: 'references/details.md', content: 'Reference content.' },
      ])

      await writeCandidate(dataDir, 'test-skill', candidate)

      await expect(loadCandidate(dataDir, 'test-skill', 'input-hash')).resolves.toStrictEqual(candidate)
    })

    test('rejects a missing candidate', async () => {
      await expect(loadCandidate(dataDir, 'test-skill', 'input-hash')).rejects.toMatchObject({
        message: "No generated skill found for 'test-skill'.",
        hint: "Run 'starlight-to-skills generate test-skill'.",
      })
    })

    test('rejects an outdated candidate', async () => {
      await writeCandidate(
        dataDir,
        'test-skill',
        createCandidate('old-input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }]),
      )

      await expect(loadCandidate(dataDir, 'test-skill', 'new-input-hash')).rejects.toMatchObject({
        message: "Generated skill for 'test-skill' is out of date.",
        hint: "Run 'starlight-to-skills generate test-skill' again.",
      })
    })

    test('rejects a manually updated candidate', async () => {
      await writeCandidate(
        dataDir,
        'test-skill',
        createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }]),
      )

      await project.write('.starlight-to-skills/test-skill/SKILL.md', 'Edited skill content.')

      await expect(loadCandidate(dataDir, 'test-skill', 'input-hash')).rejects.toMatchObject({
        message: "Generated skill for 'test-skill' is invalid.",
        hint: "Run 'starlight-to-skills generate test-skill' again.",
      })
    })

    test('rejects an invalid manifested path', async () => {
      await writeCandidate(
        dataDir,
        'test-skill',
        createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }]),
      )
      const manifestPath = '.starlight-to-skills/test-skill/manifest.json'
      const manifest = JSON.parse(await project.read(manifestPath)) as SkillManifest

      const [file] = manifest.files
      expect.assert(file)
      file.path = '../outside.md'

      await project.write(manifestPath, JSON.stringify(manifest))

      await expect(loadCandidate(dataDir, 'test-skill', 'input-hash')).rejects.toMatchObject({
        message: "Generated skill for 'test-skill' is invalid.",
        hint: "Run 'starlight-to-skills generate test-skill' again.",
      })
    })
  })

  describe('removeCandidateForInput', () => {
    test('removes a candidate', async () => {
      await writeCandidate(
        dataDir,
        'test-skill',
        createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }]),
      )

      await removeCandidateForInput(dataDir, 'test-skill', 'input-hash')

      await expect(project.exists('.starlight-to-skills/test-skill')).resolves.toBe(false)
    })

    test('preserves a candidate with a different input hash', async () => {
      await writeCandidate(
        dataDir,
        'test-skill',
        createCandidate('old-input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }]),
      )

      await removeCandidateForInput(dataDir, 'test-skill', 'new-input-hash')

      await expect(project.read('.starlight-to-skills/test-skill/SKILL.md')).resolves.toBe('Skill content.')
    })

    test('does not throw if a candidate does not exist', async () => {
      await expect(removeCandidateForInput(dataDir, 'test-skill', 'input-hash')).resolves.toBeUndefined()
    })

    test('removes a candidate with an invalid manifest', async () => {
      await writeCandidate(
        dataDir,
        'test-skill',
        createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }]),
      )

      await project.write('.starlight-to-skills/test-skill/manifest.json', '{}')

      await removeCandidateForInput(dataDir, 'test-skill', 'input-hash')

      await expect(project.exists('.starlight-to-skills/test-skill')).resolves.toBe(false)
    })
  })

  describe('approveCandidate', () => {
    let config: StarlightToSkillsConfig
    let skill: SkillConfiguration

    const digest: SkillDigest = {
      inputHash: 'input-hash',
      definitionHash: 'definition-hash',
      docs: [{ path: './guide.md', contentHash: 'doc-hash' }],
    }

    test.beforeEach(() => {
      config = {
        model: 'openai/gpt-5.6-luna',
        definitions: './src/skills/*.skill.ts',
        url: new URL('starlight-to-skills.config.ts', project.rootDir),
        rootDir: project.rootDir,
        dataDir: new URL('.starlight-to-skills/', project.rootDir),
        outputDir: new URL('skills/', project.rootDir),
      }

      skill = {
        name: 'test-skill',
        url: new URL('src/skills/test-skill.skill.ts', project.rootDir),
        description: 'Migrate a project to v2.',
        docs: ['./guide.md'],
      }
    })

    test('approves a candidate', async () => {
      const candidate = createCandidate('input-hash', [
        { path: 'SKILL.md', content: 'Skill content.' },
        { path: 'references/details.md', content: 'Reference content.' },
      ])

      await expect(approveCandidate(config, skill, digest, candidate)).resolves.toBe('approved')

      await expect(project.read('skills/test-skill/SKILL.md')).resolves.toBe('Skill content.')
      await expect(project.read('skills/test-skill/references/details.md')).resolves.toBe('Reference content.')

      const manifestData = await project.read('skills/.starlight-to-skills/test-skill.json')
      const manifest = JSON.parse(manifestData) as SkillManifest

      expect(manifest).toStrictEqual({
        schemaVersion: 1,
        generatorVersion: GeneratorVersion,
        model: 'openai/gpt-5.6-luna',
        name: 'test-skill',
        inputHash: 'input-hash',
        definitionHash: 'definition-hash',
        docs: [{ path: './guide.md', contentHash: 'doc-hash' }],
        files: candidate.fileDigests,
      })
    })

    test('does not reapprove the current candidate', async () => {
      const candidate = createCandidate('input-hash', [
        { path: 'SKILL.md', content: 'Skill content.' },
        { path: 'references/details.md', content: 'Reference content.' },
      ])

      await approveCandidate(config, skill, digest, candidate)

      await expect(approveCandidate(config, skill, digest, candidate)).resolves.toBe('already-approved')
    })

    test('reapproves a candidate when the approved skill changed', async () => {
      const candidate = createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }])

      await approveCandidate(config, skill, digest, candidate)
      await project.write('skills/test-skill/SKILL.md', 'Edited skill content.')

      await expect(approveCandidate(config, skill, digest, candidate)).resolves.toBe('approved')

      await expect(project.read('skills/test-skill/SKILL.md')).resolves.toBe('Skill content.')
    })

    test('reapproves a candidate when the approved skill contains extra files', async () => {
      const candidate = createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }])
      await approveCandidate(config, skill, digest, candidate)

      await project.write('skills/test-skill/references/details.md', 'Reference content.')

      await expect(approveCandidate(config, skill, digest, candidate)).resolves.toBe('approved')

      await expect(project.exists('skills/test-skill/references/details.md')).resolves.toBe(false)
    })

    test('recreates an approved skill replaced by a file', async () => {
      const candidate = createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }])
      await approveCandidate(config, skill, digest, candidate)
      await fs.rm(project.path('skills/test-skill'), { recursive: true })
      await project.write('skills/test-skill', 'Corrupted skill.')

      await expect(approveCandidate(config, skill, digest, candidate)).resolves.toBe('approved')

      await expect(project.read('skills/test-skill/SKILL.md')).resolves.toBe('Skill content.')
    })

    test('replaces previous approved skill with a new candidate', async () => {
      await approveCandidate(
        config,
        skill,
        digest,
        createCandidate('input-hash', [
          { path: 'SKILL.md', content: 'Old skill content.' },
          { path: 'references/deprecated.md', content: 'Deprecated content.' },
        ]),
      )

      await approveCandidate(
        config,
        skill,
        digest,
        createCandidate('input-hash', [{ path: 'SKILL.md', content: 'New skill content.' }]),
      )

      await expect(project.read('skills/test-skill/SKILL.md')).resolves.toMatchInlineSnapshot(`"New skill content."`)

      await expect(project.exists('skills/test-skill/references/deprecated.md')).resolves.toBe(false)
    })

    test('rejects an invalid candidate', async () => {
      await approveCandidate(
        config,
        skill,
        digest,
        createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Old skill content.' }]),
      )
      const candidate = createCandidate('input-hash', [{ path: 'SKILL.md', content: 'New skill content.' }])

      const [file] = candidate.files
      expect.assert(file)
      file.path = '../outside.md'

      await expect(approveCandidate(config, skill, digest, candidate)).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Invalid generated skill file path '../outside.md'.]`,
      )

      await expect(project.read('skills/test-skill/SKILL.md')).resolves.toBe('Old skill content.')
    })

    test('rejects an unmanaged skill', async () => {
      await project.write('skills/test-skill/SKILL.md', 'Unmanaged content.')

      await expect(
        approveCandidate(
          config,
          skill,
          digest,
          createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Candidate content.' }]),
        ),
      ).rejects.toMatchObject({
        message: `Cannot approve 'test-skill' because a file or directory already exists at '${fileURLToPath(new URL('test-skill', config.outputDir))}'.`,
        hint: 'Move the existing file or directory and try again.',
      })

      await expect(project.read('skills/test-skill/SKILL.md')).resolves.toMatchInlineSnapshot(`"Unmanaged content."`)
    })
  })
})

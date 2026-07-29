import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { beforeEach, describe, expect, test } from 'vitest'

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
  let dataDir: URL
  let testDir: string
  let candidateUrl: URL

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starlight-to-skills-'))
    dataDir = pathToFileURL(path.join(testDir, '.starlight-to-skills', path.sep))
    candidateUrl = new URL('test-skill/', dataDir)

    return () => fs.rm(testDir, { force: true, recursive: true })
  })

  describe('writeCandidate', () => {
    test('writes a candidate', async () => {
      const candidate = createCandidate('input-hash', [
        { path: 'SKILL.md', content: 'Skill content.' },
        { path: 'references/details.md', content: 'Reference content.' },
      ])

      await writeCandidate(dataDir, 'test-skill', candidate)

      await expect(fs.readFile(new URL('SKILL.md', candidateUrl), 'utf8')).resolves.toMatchInlineSnapshot(
        `"Skill content."`,
      )
      await expect(fs.readFile(new URL('references/details.md', candidateUrl), 'utf8')).resolves.toMatchInlineSnapshot(
        `"Reference content."`,
      )

      await expect(fs.readFile(new URL('manifest.json', candidateUrl), 'utf8')).resolves.toMatchInlineSnapshot(`
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

      const candidateDir = new URL('test-skill/', dataDir)

      await expect(fs.readFile(new URL('SKILL.md', candidateDir), 'utf8')).resolves.toMatchInlineSnapshot(
        `"New skill content."`,
      )

      await expect(fs.stat(new URL('references/deprecated.md', candidateDir))).rejects.toMatchObject({ code: 'ENOENT' })

      await expect(fs.readFile(new URL('manifest.json', candidateDir), 'utf8')).resolves.toMatchInlineSnapshot(`
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

      await expect(
        fs.readFile(path.join(testDir, '.starlight-to-skills', 'test-skill', referencePath), 'utf8'),
      ).resolves.toBe('Reference content.')

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

      await expect(fs.readFile(new URL('SKILL.md', candidateUrl), 'utf8')).resolves.toBe('Old skill content.')
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

      await fs.writeFile(new URL('SKILL.md', candidateUrl), 'Edited skill content.')

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
      const manifestUrl = new URL('manifest.json', candidateUrl)
      const manifest = JSON.parse(await fs.readFile(manifestUrl, 'utf8')) as SkillManifest

      const [file] = manifest.files
      expect.assert(file)
      file.path = '../outside.md'

      await fs.writeFile(manifestUrl, JSON.stringify(manifest))

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

      await expect(fs.stat(candidateUrl)).rejects.toMatchObject({ code: 'ENOENT' })
    })

    test('preserves a candidate with a different input hash', async () => {
      await writeCandidate(
        dataDir,
        'test-skill',
        createCandidate('old-input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }]),
      )

      await removeCandidateForInput(dataDir, 'test-skill', 'new-input-hash')

      await expect(fs.readFile(new URL('SKILL.md', candidateUrl), 'utf8')).resolves.toBe('Skill content.')
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

      await fs.writeFile(new URL('manifest.json', candidateUrl), '{}')

      await removeCandidateForInput(dataDir, 'test-skill', 'input-hash')

      await expect(fs.stat(candidateUrl)).rejects.toMatchObject({ code: 'ENOENT' })
    })
  })

  describe('approveCandidate', () => {
    let rootDir: URL
    let config: StarlightToSkillsConfig
    let skill: SkillConfiguration

    const digest: SkillDigest = {
      inputHash: 'input-hash',
      definitionHash: 'definition-hash',
      docs: [{ path: './guide.md', contentHash: 'doc-hash' }],
    }

    beforeEach(() => {
      rootDir = pathToFileURL(`${testDir}${path.sep}`)

      config = {
        model: 'openai/gpt-5.6-luna',
        definitions: './src/skills/*.skill.ts',
        url: new URL('starlight-to-skills.config.ts', rootDir),
        rootDir,
        dataDir: new URL('.starlight-to-skills/', rootDir),
        outputDir: new URL('skills/', rootDir),
      }

      skill = {
        name: 'test-skill',
        url: new URL('src/skills/test-skill.skill.ts', rootDir),
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

      const approvedSkillUrl = new URL(`${skill.name}/`, config.outputDir)

      await expect(fs.readFile(new URL('SKILL.md', approvedSkillUrl), 'utf8')).resolves.toBe('Skill content.')
      await expect(fs.readFile(new URL('references/details.md', approvedSkillUrl), 'utf8')).resolves.toBe(
        'Reference content.',
      )

      const manifestData = await fs.readFile(path.join(testDir, 'skills/.starlight-to-skills/test-skill.json'), 'utf8')
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
      await fs.writeFile(new URL(`${skill.name}/SKILL.md`, config.outputDir), 'Edited skill content.')

      await expect(approveCandidate(config, skill, digest, candidate)).resolves.toBe('approved')

      await expect(fs.readFile(new URL(`${skill.name}/SKILL.md`, config.outputDir), 'utf8')).resolves.toBe(
        'Skill content.',
      )
    })

    test('reapproves a candidate when the approved skill contains extra files', async () => {
      const candidate = createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }])
      const extraFileUrl = new URL(`${skill.name}/references/details.md`, config.outputDir)

      await approveCandidate(config, skill, digest, candidate)

      await fs.mkdir(new URL('.', extraFileUrl), { recursive: true })
      await fs.writeFile(extraFileUrl, 'Reference content.')

      await expect(approveCandidate(config, skill, digest, candidate)).resolves.toBe('approved')

      await expect(fs.stat(extraFileUrl)).rejects.toMatchObject({ code: 'ENOENT' })
    })

    test('recreates an approved skill replaced by a file', async () => {
      const candidate = createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }])
      const skillEntryUrl = new URL(skill.name, config.outputDir)

      await approveCandidate(config, skill, digest, candidate)
      await fs.rm(skillEntryUrl, { recursive: true })
      await fs.writeFile(skillEntryUrl, 'Corrupted skill.')

      await expect(approveCandidate(config, skill, digest, candidate)).resolves.toBe('approved')

      await expect(fs.readFile(new URL(`${skill.name}/SKILL.md`, config.outputDir), 'utf8')).resolves.toBe(
        'Skill content.',
      )
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

      const approvedSkillUrl = new URL(`${skill.name}/`, config.outputDir)

      await expect(fs.readFile(new URL('SKILL.md', approvedSkillUrl), 'utf8')).resolves.toMatchInlineSnapshot(
        `"New skill content."`,
      )

      await expect(fs.stat(new URL('references/deprecated.md', approvedSkillUrl))).rejects.toMatchObject({
        code: 'ENOENT',
      })
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

      await expect(fs.readFile(new URL(`${skill.name}/SKILL.md`, config.outputDir), 'utf8')).resolves.toBe(
        'Old skill content.',
      )
    })

    test('rejects an unmanaged skill', async () => {
      const approvedSkillUrl = new URL('test-skill/', config.outputDir)

      await fs.mkdir(approvedSkillUrl, { recursive: true })
      await fs.writeFile(new URL('SKILL.md', approvedSkillUrl), 'Unmanaged content.')

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

      await expect(fs.readFile(new URL('SKILL.md', approvedSkillUrl), 'utf8')).resolves.toMatchInlineSnapshot(
        `"Unmanaged content."`,
      )
    })
  })
})

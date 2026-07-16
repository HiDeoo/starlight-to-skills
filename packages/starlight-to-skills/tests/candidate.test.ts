import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createCandidate, removeCandidateForInput, writeCandidate } from '../src/libs/candidate'
import type { SkillFile } from '../src/libs/content'

describe('createCandidate', () => {
  test('creates a candidate', () => {
    const files = [
      { path: 'SKILL.md', content: 'Skill content.' },
      { path: 'references/details.md', content: 'Reference content.' },
    ] satisfies SkillFile[]

    const candidate = createCandidate('input-hash', files)

    expect(candidate.inputHash).toBe('input-hash')
    expect(candidate.files).toStrictEqual(files)

    expect(candidate.fileDigests).toHaveLength(2)
    expect(candidate.fileDigests[0]?.path).toBe('SKILL.md')
    expect(candidate.fileDigests[0]?.contentHash).toBeSha256()
    expect(candidate.fileDigests[1]?.path).toBe('references/details.md')
    expect(candidate.fileDigests[1]?.contentHash).toBeSha256()
  })
})

describe('persistence', () => {
  let dataDir: URL
  let testDir: string

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starlight-to-skills-'))
    dataDir = pathToFileURL(path.join(testDir, '.starlight-to-skills', path.sep))
  })

  afterEach(async () => {
    await fs.rm(testDir, { force: true, recursive: true })
  })

  describe('writeCandidate', () => {
    test('writes a candidate', async () => {
      const candidate = createCandidate('input-hash', [
        { path: 'SKILL.md', content: 'Skill content.' },
        { path: 'references/details.md', content: 'Reference content.' },
      ])

      const candidateUrl = await writeCandidate(dataDir, 'test-skill', candidate)

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

      expect(candidateUrl).toEqual(new URL('test-skill/', dataDir))
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
  })

  describe('removeCandidateForInput', () => {
    test('removes a candidate', async () => {
      const candidateUrl = await writeCandidate(
        dataDir,
        'test-skill',
        createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }]),
      )

      await removeCandidateForInput(dataDir, 'test-skill', 'input-hash')

      await expect(fs.stat(candidateUrl)).rejects.toMatchObject({ code: 'ENOENT' })
    })

    test('preserves a candidate with a different input hash', async () => {
      const candidateUrl = await writeCandidate(
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
      const candidateUrl = await writeCandidate(
        dataDir,
        'test-skill',
        createCandidate('input-hash', [{ path: 'SKILL.md', content: 'Skill content.' }]),
      )

      await fs.writeFile(new URL('manifest.json', candidateUrl), '{}')

      await removeCandidateForInput(dataDir, 'test-skill', 'input-hash')

      await expect(fs.stat(candidateUrl)).rejects.toMatchObject({ code: 'ENOENT' })
    })
  })
})

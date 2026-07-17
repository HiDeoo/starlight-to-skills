import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import type { StarlightToSkillsConfig } from '../src/config'
import { computeSkillFileDigest, DigestVersion } from '../src/libs/digest'
import { discoverSkillDefinitions, getSkillDefinitionUrlByName, loadSkill } from '../src/libs/skill'
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
    digestVersion: DigestVersion,
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

  test('reports a modified file', async () => {
    await fs.writeFile(new URL('references/details.md', skillUrl), 'Modified reference content.')

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

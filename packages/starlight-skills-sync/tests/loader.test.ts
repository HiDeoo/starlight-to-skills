import { describe, expect, test } from 'vitest'

import type { StarlightSkillsSyncConfig } from '../src/config'
import { discoverSkills, loadConfig, loadSkill } from '../src/libs/loader'

describe('loadConfig', () => {
  test('loads and resolves valid configuration', async () => {
    const rootDir = new URL('fixtures/config-valid/', import.meta.url)

    const config = await loadConfig(rootDir)

    expect(config).toStrictEqual({
      url: new URL('starlight-skills-sync.config.ts', rootDir),
      rootDir,
      model: 'openai/gpt-5.6-luna',
      definitions: './src/skills-definitions/*.skill.ts',
      outputDir: new URL('../skills/', rootDir),
      syncDir: new URL('.starlight-skills-sync/', rootDir),
    })
  })

  test('does not search parent directories', async () => {
    const rootDir = new URL('fixtures/config-parent/nested/', import.meta.url)

    await expect(loadConfig(rootDir)).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Failed to load Starlight Skills Sync configuration 'starlight-skills-sync.config.ts'.]`,
    )
  })

  test('rejects configuration without a default export', async () => {
    const rootDir = new URL('fixtures/config-no-default/', import.meta.url)

    await expect(loadConfig(rootDir)).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid Starlight Skills Sync config 'starlight-skills-sync.config.ts'.]`,
    )
  })

  test('rejects invalid configuration', async () => {
    const rootDir = new URL('fixtures/config-invalid/', import.meta.url)

    await expect(loadConfig(rootDir)).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid Starlight Skills Sync config 'starlight-skills-sync.config.ts'.]`,
    )
  })
})

describe('loadSkill', () => {
  test('loads a skill definition and resolves its configuration', async () => {
    const definitionUrl = new URL('fixtures/definition-valid.skill.ts', import.meta.url)

    const configuration = await loadSkill(definitionUrl)

    expect(configuration).toStrictEqual({
      name: 'definition-valid',
      url: definitionUrl,
      description: 'Do the thing.',
      docs: ['getting-started', 'guides/custom-thing'],
      guidance: 'Add a usage example to the generated skill.',
    })
  })

  test('rejects definition without a default export', async () => {
    const definitionUrl = new URL('fixtures/definition-no-default.skill.ts', import.meta.url)

    await expect(loadSkill(definitionUrl)).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid skill definition 'definition-no-default.skill.ts'.]`,
    )
  })

  test('rejects invalid definition', async () => {
    const definitionUrl = new URL('fixtures/definition-invalid.skill.ts', import.meta.url)

    await expect(loadSkill(definitionUrl)).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid skill definition 'definition-invalid.skill.ts'.]`,
    )
  })
})

describe('discoverSkill', () => {
  const rootDir = new URL('fixtures/', import.meta.url)

  test('discovers skill definitions', async () => {
    const skills = await discoverSkills({ rootDir, definitions: '*.skill.ts' } as StarlightSkillsSyncConfig)

    expect(skills).toStrictEqual([
      new URL('definition-invalid.skill.ts', rootDir),
      new URL('definition-no-default.skill.ts', rootDir),
      new URL('definition-valid.skill.ts', rootDir),
    ])
  })

  test('returns an empty list of definitions when no matches are found', async () => {
    const skills = await discoverSkills({ rootDir, definitions: './unknown/*.skill.ts' } as StarlightSkillsSyncConfig)

    expect(skills).toStrictEqual([])
  })
})

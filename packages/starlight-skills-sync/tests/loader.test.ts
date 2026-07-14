import { describe, expect, test } from 'vitest'

import { loadConfig, loadSkill } from '../src/libs/loader'

describe('loadConfig', () => {
  test('loads and resolves valid configuration', async () => {
    const rootDir = new URL('fixtures/config-valid/', import.meta.url)

    const config = await loadConfig(rootDir)

    expect(config).toStrictEqual({
      model: 'openai/gpt-5.6-luna',
      definitions: './src/skills-definitions/*.skill.ts',
      url: new URL('starlight-skills-sync.config.ts', rootDir),
      rootDir,
      dataDir: new URL('.starlight-skills-sync/', rootDir),
      outputDir: new URL('../skills/', rootDir),
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
      docs: ['./getting-started.mdx', './guides/custom-thing.md'],
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

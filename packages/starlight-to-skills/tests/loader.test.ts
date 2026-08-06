import { describe, expect, test } from 'vitest'

import { loadConfig, loadSkillDefinitionInputs } from '../src/libs/loader'

describe('loadConfig', () => {
  test('loads and resolves valid configuration', async () => {
    const rootDir = new URL('fixtures/config-valid/', import.meta.url)

    const config = await loadConfig(rootDir)

    expect(config).toStrictEqual({
      model: 'openai/gpt-5.6-luna',
      url: new URL('starlight-to-skills.config.ts', rootDir),
      rootDir,
      dataDir: new URL('.starlight-to-skills/', rootDir),
      definitionsDir: new URL('src/skills-definitions/', rootDir),
      outputDir: new URL('../skills/', rootDir),
    })
  })

  test('does not search parent directories', async () => {
    const rootDir = new URL('fixtures/config-parent/nested/', import.meta.url)

    await expect(loadConfig(rootDir)).rejects.toThrow(
      "Failed to load configuration file 'starlight-to-skills.config.ts'.",
    )
  })

  test('rejects configuration without a default export', async () => {
    const rootDir = new URL('fixtures/config-no-default/', import.meta.url)

    await expect(loadConfig(rootDir)).rejects.toThrow("Invalid configuration file 'starlight-to-skills.config.ts'.")
  })

  test('rejects invalid configuration', async () => {
    const rootDir = new URL('fixtures/config-invalid/', import.meta.url)

    await expect(loadConfig(rootDir)).rejects.toThrow("Invalid configuration file 'starlight-to-skills.config.ts'.")
  })
})

describe('loadSkillDefinitionInputs', () => {
  const config = { model: 'openai/gpt-5.6-luna', rootDir: new URL('fixtures/project/', import.meta.url) }

  test('loads a skill definition, documentation, and digest', async () => {
    const definitionUrl = new URL('fixtures/skill-valid.skill.ts', import.meta.url)

    const { definition, docs, digest } = await loadSkillDefinitionInputs(config, definitionUrl)

    expect(definition).toStrictEqual({
      name: 'skill-valid',
      url: definitionUrl,
      description: 'Do the thing.',
      docs: ['./getting-started.mdx', './guides/custom-thing.md'],
      guidance: 'Add a usage example to the generated skill.',
      license: 'MIT',
      compatibility: 'Requires git, docker, jq, and access to the internet',
      metadata: { author: 'example-org', version: '1.0' },
    })

    expect(docs.map((doc) => doc.path)).toStrictEqual(definition.docs)

    expect(digest.inputHash).toBeSha256()
    expect(digest.definitionHash).toBeSha256()
    expect(digest.docs.map((doc) => doc.path)).toStrictEqual(definition.docs)
  })

  test('rejects definition without a default export', async () => {
    const definitionUrl = new URL('fixtures/skill-no-default.skill.ts', import.meta.url)

    await expect(loadSkillDefinitionInputs(config, definitionUrl)).rejects.toThrow(
      "Invalid skill definition 'skill-no-default.skill.ts'.",
    )
  })

  test('rejects invalid definition', async () => {
    const definitionUrl = new URL('fixtures/skill-invalid.skill.ts', import.meta.url)

    await expect(loadSkillDefinitionInputs(config, definitionUrl)).rejects.toThrow(
      "Invalid skill definition 'skill-invalid.skill.ts'.",
    )
  })
})

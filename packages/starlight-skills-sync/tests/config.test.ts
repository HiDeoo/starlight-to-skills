import { expect, test } from 'vitest'

import { defineConfig, type StarlightSkillsSyncUserConfig } from '../src/config'

test('returns the configuration unchanged', () => {
  const config = {
    model: 'openai/gpt-5',
    definitions: './definitions/*.skill.ts',
    outputDir: './output',
  } satisfies StarlightSkillsSyncUserConfig

  const result = defineConfig(config)

  expect(result).toStrictEqual(config)
})

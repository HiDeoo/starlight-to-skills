import { expect, test } from 'vitest'

import { defineConfig, type StarlightToSkillsUserConfig } from '../src/config'

test('returns the configuration unchanged', () => {
  const config = {
    model: 'openai/gpt-5',
    definitions: './definitions/*.skill.ts',
    outputDir: './output',
  } satisfies StarlightToSkillsUserConfig

  const result = defineConfig(config)

  expect(result).toStrictEqual(config)
})

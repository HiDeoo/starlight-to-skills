import { expect, test } from 'vitest'

import { defineConfig, type StarlightToSkillsUserConfig } from '../src/config'

test('returns the configuration unchanged', () => {
  const config: StarlightToSkillsUserConfig = {
    model: 'openai/gpt-5',
    definitions: './definitions/*.skill.ts',
    outputDir: './output',
  }

  expect(defineConfig(config)).toBe(config)
})

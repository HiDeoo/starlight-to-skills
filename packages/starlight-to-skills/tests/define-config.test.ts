import type { ModelRouterModelId } from '@mastra/core/llm'
import { expect, expectTypeOf, test } from 'vitest'

import { defineConfig, type StarlightToSkillsUserConfig } from '../src/config'

test('returns the configuration unchanged', () => {
  const config: StarlightToSkillsUserConfig = {
    model: 'openai/gpt-5',
    definitionsDir: './definitions',
    outputDir: './output',
  }

  const result = defineConfig(config)

  expect(result).toBe(config)

  expectTypeOf(result.model).toExtend<ModelRouterModelId>()
})

import { afterEach, expect, test, vi } from 'vitest'

import { generateSkillContent } from '../src/libs/content'
import type { SkillConfiguration } from '../src/libs/loader'

afterEach(() => {
  vi.unstubAllEnvs()
})

test('formats missing API key errors from Mastra', async () => {
  vi.stubEnv('OPENAI_API_KEY', undefined)
  vi.stubEnv('MASTRA_AUTO_REFRESH_PROVIDERS', 'false')

  const skill: SkillConfiguration = {
    name: 'test-skill',
    description: 'Test skill.',
    docs: [],
    url: new URL('file:///test-skill.skill.ts'),
  }

  await expect(generateSkillContent('openai/gpt-5.6-luna', skill, [])).rejects.toMatchInlineSnapshot(`
    Model 'openai/gpt-5.6-luna' failed to generate 'test-skill'.

    Model 'openai/gpt-5.6-luna' requires the OPENAI_API_KEY environment variable.
  `)
})

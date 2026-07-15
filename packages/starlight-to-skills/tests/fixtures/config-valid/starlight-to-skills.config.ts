import { defineConfig } from '../../../src/config'

export default defineConfig({
  model: 'openai/gpt-5.6-luna',
  definitions: './src/skills-definitions/*.skill.ts',
  outputDir: '../skills',
})

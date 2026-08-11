import { defineConfig } from '../../../src/config'

export default defineConfig({
  model: 'openai/gpt-5.6-luna',
  definitionsDir: './src/skills-definitions',
  outputDir: '../skills',
})

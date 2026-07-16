import { defineConfig } from '../../../src/config'

export default defineConfig({
  // @ts-expect-error - testing an invalid configuration
  models: 'openai/gpt-5.6-luna',
})

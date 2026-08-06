import type { ModelRouterModelId } from '@mastra/core/llm'
import { z } from 'astro/zod'

export const ConfigSchema = z.strictObject({
  model: z.string().min(1) as z.ZodType<ModelRouterModelId, ModelRouterModelId>,
  definitionsDir: z.string().default('./src/skills'),
  outputDir: z.string().default('./skills'),
})

export type StarlightToSkillsUserConfig = z.input<typeof ConfigSchema>

export type StarlightToSkillsConfig = Omit<z.output<typeof ConfigSchema>, 'definitionsDir' | 'outputDir'> & {
  url: URL
  rootDir: URL
  dataDir: URL
  definitionsDir: URL
  outputDir: URL
}

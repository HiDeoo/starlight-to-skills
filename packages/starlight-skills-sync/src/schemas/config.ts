import { z } from 'astro/zod'

export const configSchema = z.strictObject({
  model: z.string().min(1),
  definitions: z.string().default('./src/skills/*.skill.ts'),
  outputDir: z.string().default('./skills'),
})

export type StarlightSkillsSyncUserConfig = z.input<typeof configSchema>

export type StarlightSkillsSyncConfig = Omit<z.output<typeof configSchema>, 'outputDir'> & {
  url: URL
  rootDir: URL
  outputDir: URL
  syncDir: URL
}

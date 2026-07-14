import { z } from 'astro/zod'

export const skillDefinitionSchema = z.strictObject({
  // TODO(HiDeoo) max
  // TODO(HiDeoo) trim
  description: z.string().min(1),
  docs: z
    .array(z.string())
    .min(1)
    .superRefine((sources, context) => {
      const seen = new Set<string>()

      for (const [index, source] of sources.entries()) {
        if (seen.has(source)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate documentation source ID '${source}'.`,
            path: [index],
          })
        }

        seen.add(source)
      }
    }),
  guidance: z.string().optional(),
})

export type SkillUserDefinition = z.input<typeof skillDefinitionSchema>
export type SkillDefinition = z.output<typeof skillDefinitionSchema>

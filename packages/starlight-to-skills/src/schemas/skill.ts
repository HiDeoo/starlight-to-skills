import { z } from 'astro/zod'

import { StarlightDocsExtensionsRegex } from '../libs/starlight'

export const SkillDefinitionSchema = z.strictObject({
  // TODO(HiDeoo) max
  // TODO(HiDeoo) trim
  description: z.string().min(1),
  docs: z
    .array(
      z
        .string()
        .regex(StarlightDocsExtensionsRegex, 'Documentation source must use a supported Markdown or MDX extension.'),
    )
    .min(1)
    .superRefine((sources, context) => {
      const seen = new Set<string>()

      for (const [index, source] of sources.entries()) {
        if (seen.has(source)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate documentation source path '${source}'.`,
            path: [index],
          })
        }

        seen.add(source)
      }
    }),
  guidance: z.string().optional(),
})

export type SkillUserDefinition = z.input<typeof SkillDefinitionSchema>
export type SkillDefinition = z.output<typeof SkillDefinitionSchema>

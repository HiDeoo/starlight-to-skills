import { z } from 'astro/zod'

import { throwError } from '../libs/error'
import { StarlightDocsExtensionsRegex } from '../libs/starlight'
import { formatSkillName } from '../libs/style'

// https://agentskills.io/specification#name-field
export const SkillNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export function parseSkillName(name: string): string {
  const result = SkillNameSchema.safeParse(name)

  if (!result.success) {
    throwError(`Invalid skill name ${formatSkillName(name)}.`, {
      hint: 'Use 1-64 lowercase letters, numbers, or hyphens, without leading, trailing, or consecutive hyphens.',
    })
  }

  return result.data
}

export const SkillDefinitionSchema = z.strictObject({
  description: z.string().min(1).max(1024),
  docs: z
    .array(
      z
        .string()
        .regex(StarlightDocsExtensionsRegex, 'A documentation file must use a supported Markdown or MDX extension.'),
    )
    .min(1)
    .superRefine((sources, context) => {
      const seen = new Set<string>()

      for (const [index, source] of sources.entries()) {
        if (seen.has(source)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate documentation file path '${source}'.`,
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

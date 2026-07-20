import { z } from 'astro/zod'

import { StarlightDocsExtensionsRegex } from '../libs/starlight'

// https://agentskills.io/specification#name-field
export const SkillNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Skill name must be 1-64 characters, must only contain unicode lowercase alphanumeric characters and hyphens, must not start or end with a hyphen, and must not contain consecutive hyphens.',
  )

export function parseSkillName(name: string): string {
  const result = SkillNameSchema.safeParse(name)

  if (!result.success) {
    throw new Error(`Invalid skill name '${name}'. ${result.error.issues[0]?.message}`)
  }

  return result.data
}

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

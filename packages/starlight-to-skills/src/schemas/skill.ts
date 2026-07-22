import { z } from 'astro/zod'

import { StarlightDocsExtensionsRegex } from '../libs/starlight'

// https://agentskills.io/specification#name-field
export const SkillNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'A skill name must be 1-64 characters and contain only lowercase letters (a-z), numbers (0-9), and hyphens. It cannot start or end with a hyphen or contain consecutive hyphens.',
  )

export function parseSkillName(name: string): string {
  const result = SkillNameSchema.safeParse(name)

  if (!result.success) {
    throw new Error(`Invalid skill name '${name}'.\n\n${result.error.issues[0]?.message}`)
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

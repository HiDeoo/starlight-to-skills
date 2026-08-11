import { z } from 'astro/zod'

export const SkillDigestSchema = z.strictObject({
  inputHash: z.string(),
  definitionHash: z.string(),
  docs: z
    .array(
      z.strictObject({
        path: z.string(),
        contentHash: z.string(),
      }),
    )
    .min(1),
})

export type SkillDigest = z.output<typeof SkillDigestSchema>

import { z } from 'astro/zod'

export const SkillDigestSchema = z.strictObject({
  inputHash: z.string(),
  definitionHash: z.string(),
  sources: z
    .array(
      z.strictObject({
        docsPath: z.string(),
        contentHash: z.string(),
      }),
    )
    .min(1),
})

export type SkillDigest = z.output<typeof SkillDigestSchema>

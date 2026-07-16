import { z } from 'astro/zod'

export const CandidateManifestSchema = z.strictObject({
  inputHash: z.string(),
  files: z.array(
    z.strictObject({
      path: z.string(),
      contentHash: z.string(),
    }),
  ),
})

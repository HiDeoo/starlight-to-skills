import { z } from 'astro/zod'

import { GeneratorVersion, type SkillFileDigest } from '../libs/digest'
import type { SkillConfiguration } from '../libs/loader'

import { CandidateFilePathsSchema } from './candidate'
import type { StarlightToSkillsConfig } from './config'
import { SkillDigestSchema, type SkillDigest } from './digest'
import { SkillNameSchema } from './skill'

export const CandidateManifestSchema = z.strictObject({
  inputHash: z.string(),
  files: z
    .array(
      z.strictObject({
        path: z.string(),
        contentHash: z.string(),
      }),
    )
    .min(1)
    .superRefine((files, context) => {
      const result = CandidateFilePathsSchema.safeParse(files.map((file) => file.path))
      if (result.success) return

      for (const issue of result.error.issues) {
        const [index] = issue.path

        context.addIssue({
          code: 'custom',
          message: issue.message,
          path: typeof index === 'number' ? [index, 'path'] : issue.path,
        })
      }
    }),
})

export const SkillManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generatorVersion: z.number(),
  model: z.string(),
  name: SkillNameSchema,
  ...SkillDigestSchema.shape,
  ...CandidateManifestSchema.shape,
})

export type SkillManifest = z.output<typeof SkillManifestSchema>

export function makeSkillManifest(
  config: StarlightToSkillsConfig,
  skill: SkillConfiguration,
  digest: SkillDigest,
  files: SkillFileDigest[],
): SkillManifest {
  return {
    schemaVersion: 1,
    generatorVersion: GeneratorVersion,
    model: config.model,
    name: skill.name,
    inputHash: digest.inputHash,
    definitionHash: digest.definitionHash,
    docs: digest.docs,
    files,
  }
}

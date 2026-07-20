import { z } from 'astro/zod'

import { GeneratorVersion, type SkillFileDigest } from '../libs/digest'
import type { SkillConfiguration } from '../libs/loader'

import type { StarlightToSkillsConfig } from './config'
import { SkillDigestSchema, type SkillDigest } from './digest'

export const CandidateManifestSchema = z.strictObject({
  inputHash: z.string(),
  files: z
    .array(
      z.strictObject({
        path: z.string(),
        contentHash: z.string(),
      }),
    )
    .min(1),
})

export const SkillManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generatorVersion: z.number(),
  model: z.string(),
  name: z.string(),
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
    sources: digest.sources,
    files,
  }
}

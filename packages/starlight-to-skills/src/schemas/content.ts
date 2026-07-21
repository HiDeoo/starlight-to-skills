import { z } from 'astro/zod'

import { CandidateReferencePathSchema } from './candidate'

const contentResultIssueTypeSchema = z.enum(['source-conflict', 'source-incomplete'])

export const ContentResultSchema = z.strictObject({
  data: z.union([
    z.strictObject({
      status: z.literal('error'),
      issues: z
        .array(
          z.strictObject({
            type: contentResultIssueTypeSchema,
            docsPaths: z.array(z.string().min(1)),
            details: z.string(),
          }),
        )
        .min(1),
    }),
    z.strictObject({
      status: z.literal('success'),
      body: z.string().min(1),
      references: z.array(
        z.strictObject({
          path: CandidateReferencePathSchema,
          body: z.string().min(1),
        }),
      ),
    }),
  ]),
})

export const ContentResultJSONSchema = z.toJSONSchema(ContentResultSchema)

export const ContentResultIssueLabels = {
  'source-conflict': 'Source conflict',
  'source-incomplete': 'Source incomplete',
} satisfies Record<z.output<typeof contentResultIssueTypeSchema>, string>

export type SkillContentResult = z.output<typeof ContentResultSchema>['data']

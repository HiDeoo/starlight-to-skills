import { z } from 'astro/zod'

export const contentResultSchema = z.strictObject({
  data: z.union([
    z.strictObject({
      status: z.literal('error'),
      issues: z
        .array(
          z.strictObject({
            type: z.enum(['source-conflict', 'source-incomplete']),
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
          path: z.string().min(1),
          body: z.string().min(1),
        }),
      ),
    }),
  ]),
})

export const contentResultJSONSchema = z.toJSONSchema(contentResultSchema)

export type SkillContentResult = z.output<typeof contentResultSchema>['data']

import { z } from 'astro/zod'

import type { SkillFile } from '../libs/content'
import { normalizeLineEndings } from '../libs/digest'

// https://agentskills.io/specification#progressive-disclosure
const maxSkillLines = 500

export const CandidateReferencePathSchema = z
  .string()
  .regex(/^references\/(?:[^/\\]+\/)*[^/\\]+\.md$/)
  .refine((path) => path.split('/').every((segment) => segment !== '.' && segment !== '..'))

export const CandidateFilePathSchema = z.string().superRefine((filePath, context) => {
  if (filePath === 'SKILL.md' || CandidateReferencePathSchema.safeParse(filePath).success) return

  context.addIssue({
    code: 'custom',
    message: `Invalid candidate file path '${filePath}'.`,
  })
})

export const CandidateFilePathsSchema = z.array(CandidateFilePathSchema).superRefine((filePaths, context) => {
  const paths = new Set<string>()
  let skillFileCount = 0

  for (const [index, filePath] of filePaths.entries()) {
    if (paths.has(filePath)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate candidate file path '${filePath}'.`,
        path: [index],
      })
    }

    paths.add(filePath)
    if (filePath === 'SKILL.md') skillFileCount++
  }

  if (skillFileCount !== 1) {
    context.addIssue({
      code: 'custom',
      message: "Candidate must contain exactly one 'SKILL.md' file.",
    })
  }

  for (const [index, filePath] of filePaths.entries()) {
    const segments = filePath.split('/')

    for (let segmentCount = segments.length - 1; segmentCount > 0; segmentCount--) {
      const ancestorPath = segments.slice(0, segmentCount).join('/')
      if (!paths.has(ancestorPath)) continue

      context.addIssue({
        code: 'custom',
        message: `Candidate file path '${ancestorPath}' conflicts with '${filePath}'.`,
        path: [index],
      })
      break
    }
  }
})

export function validateCandidateFiles(files: SkillFile[]) {
  validateCandidateFilePaths(files)

  for (const file of files) {
    if (file.path !== 'SKILL.md') continue

    const lines = normalizeLineEndings(file.content).split('\n')
    // Remove trailing empty line at the end of the file.
    if (lines.at(-1) === '') lines.pop()

    if (lines.length > maxSkillLines) {
      throw new Error(`Candidate 'SKILL.md' must not contain more than ${maxSkillLines} lines.`)
    }

    return
  }
}

function validateCandidateFilePaths(files: { path: string }[]) {
  const result = CandidateFilePathsSchema.safeParse(files.map((file) => file.path))
  if (result.success) return

  throw new Error(result.error.issues[0]?.message)
}

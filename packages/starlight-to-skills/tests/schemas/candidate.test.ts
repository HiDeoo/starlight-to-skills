import { expect, test } from 'vitest'

import type { SkillFile } from '../../src/libs/content'
import { validateCandidateFiles } from '../../src/schemas/candidate'

test('requires SKILL.md', () => {
  expect(() =>
    validateCandidateFiles([createCandidateFile('references/details.md')]),
  ).toThrowErrorMatchingInlineSnapshot(`[Error: Candidate must contain exactly one 'SKILL.md' file.]`)
})

test('accepts valid candidate file paths', () => {
  expect(() =>
    validateCandidateFiles([
      createCandidateFile('SKILL.md'),
      createCandidateFile('references/Reference Guide_v2.1 #1.md'),
    ]),
  ).not.toThrow()
})

test.for([
  './SKILL.md',
  'README.md',
  '/references/details.md',
  '../references/details.md',
  'references/.md',
  'references/details.mdx',
  String.raw`references\details.md`,
  'references/./details.md',
  'references/../details.md',
  'references/nested//details.md',
])('rejects invalid candidate file path %j', (candidatePath) => {
  expect(() => validateCandidateFiles([createCandidateFile('SKILL.md'), createCandidateFile(candidatePath)])).toThrow(
    `Invalid candidate file path '${candidatePath}'.`,
  )
})

test.for(['SKILL.md', 'references/details.md'])('rejects duplicate candidate file path %j', (candidatePath) => {
  const file = createCandidateFile(candidatePath)
  const files = candidatePath === 'SKILL.md' ? [file, file] : [createCandidateFile('SKILL.md'), file, file]

  expect(() => validateCandidateFiles(files)).toThrow(`Duplicate candidate file path '${candidatePath}'.`)
})

test('rejects collisions', () => {
  expect(() =>
    validateCandidateFiles([
      createCandidateFile('SKILL.md'),
      createCandidateFile('references/topic.md'),
      createCandidateFile('references/topic.md/details.md'),
    ]),
  ).toThrowErrorMatchingInlineSnapshot(
    `[Error: Candidate file path 'references/topic.md' conflicts with 'references/topic.md/details.md'.]`,
  )
})

test('rejects a 501-line SKILL.md', () => {
  expect(() =>
    validateCandidateFiles([{ path: 'SKILL.md', content: Array.from({ length: 501 }, () => 'Line.').join('\n') }]),
  ).toThrowErrorMatchingInlineSnapshot(`[Error: Generated 'SKILL.md' must not exceed 500 lines.]`)
})

function createCandidateFile(path: string, content = 'Content.'): SkillFile {
  return { path, content }
}

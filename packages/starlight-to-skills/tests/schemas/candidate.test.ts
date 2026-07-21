import { expect, test } from 'vitest'

import { validateCandidateFilePaths } from '../../src/schemas/candidate'

test('requires SKILL.md', () => {
  expect(() => validateCandidateFilePaths([{ path: 'references/details.md' }])).toThrowErrorMatchingInlineSnapshot(
    `[Error: Candidate must contain exactly one 'SKILL.md' file.]`,
  )
})

test('accepts valid candidate file paths', () => {
  expect(() =>
    validateCandidateFilePaths([{ path: 'SKILL.md' }, { path: 'references/Reference Guide_v2.1 #1.md' }]),
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
  expect(() => validateCandidateFilePaths([{ path: 'SKILL.md' }, { path: candidatePath }])).toThrow(
    `Invalid candidate file path '${candidatePath}'.`,
  )
})

test.for(['SKILL.md', 'references/details.md'])('rejects duplicate candidate file path %j', (candidatePath) => {
  const file = { path: candidatePath }
  const files = candidatePath === 'SKILL.md' ? [file, file] : [{ path: 'SKILL.md' }, file, file]

  expect(() => validateCandidateFilePaths(files)).toThrow(`Duplicate candidate file path '${candidatePath}'.`)
})

test('rejects collisions', () => {
  expect(() =>
    validateCandidateFilePaths([
      { path: 'SKILL.md' },
      { path: 'references/topic.md' },
      { path: 'references/topic.md/details.md' },
    ]),
  ).toThrowErrorMatchingInlineSnapshot(
    `[Error: Candidate file path 'references/topic.md' conflicts with 'references/topic.md/details.md'.]`,
  )
})

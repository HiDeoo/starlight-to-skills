import { expect, test } from 'vitest'

import { createCandidate } from '../src/libs/candidate'
import type { SkillFile } from '../src/libs/content'

test('creates a candidate', () => {
  const files = [
    { path: 'SKILL.md', content: 'Skill content.' },
    { path: 'references/details.md', content: 'Reference content.' },
  ] satisfies SkillFile[]

  const candidate = createCandidate('input-hash', files)

  expect(candidate.inputHash).toBe('input-hash')
  expect(candidate.files).toStrictEqual(files)

  expect(candidate.fileDigests).toHaveLength(2)
  expect(candidate.fileDigests[0]?.path).toBe('SKILL.md')
  expect(candidate.fileDigests[0]?.contentHash).toBeSha256()
  expect(candidate.fileDigests[1]?.path).toBe('references/details.md')
  expect(candidate.fileDigests[1]?.contentHash).toBeSha256()
})

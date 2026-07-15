import { describe, expect, test } from 'vitest'

import { computeSkillDigest, computeSkillFileDigest } from '../src/libs/digest'
import type { SkillConfiguration } from '../src/libs/loader'
import type { SkillDocumentation } from '../src/libs/starlight'

const skill = {
  name: 'migrate-to-v2',
  description: 'Migrate to v2 with this skill.',
  docs: ['./guides/migrate-v2.md', './changelog.md'],
  guidance: 'Include refactoring steps in the generated skill.',
  url: new URL('file:///project/src/skills/migrate-to-v2.skill.ts'),
} satisfies SkillConfiguration

const docs = [
  {
    url: new URL('file:///project/src/content/docs/guides/migrate-v2.md'),
    title: 'V2 Migration Guide',
    body: 'Change foo to bar.\n\nThen change bar to baz.',
  },
  {
    url: new URL('file:///project/src/content/docs/changelog.md'),
    title: 'Changelog',
    body: '# Changelog\n\n## v2.0.0\n\n- Added new features.',
  },
] satisfies SkillDocumentation[]

const sha256Regex = /^[a-f\d]{64}$/

describe('computeSkillDigest', () => {
  test('computes a skill digest', () => {
    const digest = computeSkillDigest('openai/gpt-5.6-luna', skill, docs)

    expect(digest.hash).toMatch(sha256Regex)

    expect(digest.sources).toHaveLength(2)
    expect(digest.sources[0]?.docsPath).toBe(skill.docs[0])
    expect(digest.sources[0]?.contentHash).toMatch(sha256Regex)
    expect(digest.sources[1]?.docsPath).toBe(skill.docs[1])
    expect(digest.sources[1]?.contentHash).toMatch(sha256Regex)

    expect(digest.definitionHash).toMatch(sha256Regex)
  })

  test('normalizes line endings', () => {
    const lfDigest = computeSkillDigest('openai/gpt-5.6-luna', skill, docs)

    const crlfDocs = docs.map((doc) => ({
      ...doc,
      body: doc.body.replaceAll('\n', '\r\n'),
    }))

    const crlfDigest = computeSkillDigest('openai/gpt-5.6-luna', skill, crlfDocs)

    expect(lfDigest).toStrictEqual(crlfDigest)
  })

  test('hashes relevant values', () => {
    const digest = computeSkillDigest('openai/gpt-5.6-luna', skill, docs)

    const differentModelDigest = computeSkillDigest('openai/gpt-5.6-terra', skill, docs)

    expect(digest.hash).not.toBe(differentModelDigest.hash)

    const differentSkillDigest = computeSkillDigest(
      'openai/gpt-5.6-luna',
      { ...skill, description: 'Migrate to v3 with this skill.' },
      docs,
    )

    expect(digest.hash).not.toBe(differentSkillDigest.hash)

    const differentDocsOrderDigest = computeSkillDigest('openai/gpt-5.6-luna', skill, docs.toReversed())

    expect(digest.hash).not.toBe(differentDocsOrderDigest.hash)

    const differentDocsPathDigest = computeSkillDigest(
      'openai/gpt-5.6-luna',
      { ...skill, docs: ['./migrations/migrate-v2.md', './changelog.md'] },
      docs,
    )

    expect(digest.hash).not.toBe(differentDocsPathDigest.hash)
  })
})

describe('computeSkillFileDigests', () => {
  test('computes a skill file digest', () => {
    const digests = computeSkillFileDigest([
      { path: 'SKILL.md', content: 'Skill content.' },
      { path: 'references/details.md', content: 'Reference content.' },
    ])

    expect(digests.map(({ path }) => path)).toStrictEqual(['SKILL.md', 'references/details.md'])

    expect(digests[0]?.contentHash).toMatch(sha256Regex)
    expect(digests[1]?.contentHash).toMatch(sha256Regex)
  })

  test('normalizes content line endings', () => {
    const [lfDigest] = computeSkillFileDigest([{ path: 'SKILL.md', content: 'Foo\nBar' }])
    const [crlfDigest] = computeSkillFileDigest([{ path: 'test.md', content: 'Foo\r\nBar' }])

    expect(lfDigest?.contentHash).toBe(crlfDigest?.contentHash)
  })
})

import { describe, expect, test } from 'vitest'

import { computeSkillDigest, computeSkillFileDigest } from '../src/libs/digest'
import type { SkillConfiguration } from '../src/libs/loader'
import type { SkillDocumentation } from '../src/libs/starlight'

const skill: SkillConfiguration = {
  name: 'migrate-to-v2',
  description: 'Migrate to v2 with this skill.',
  docs: ['./guides/migrate-v2.md', './changelog.md'],
  guidance: 'Include refactoring steps in the generated skill.',
  url: new URL('file:///project/src/skills/migrate-to-v2.skill.ts'),
}

const docs: SkillDocumentation[] = [
  {
    path: './guides/migrate-v2.md',
    title: 'V2 Migration Guide',
    body: 'Change foo to bar.\n\nThen change baz to quux.',
  },
  {
    path: './changelog.md',
    title: 'Changelog',
    body: '# Changelog\n\n## v2.0.0\n\n- Added new features.',
  },
]

describe('computeSkillDigest', () => {
  test('computes a skill digest', () => {
    const digest = computeSkillDigest('openai/gpt-5.6-luna', skill, docs)

    expect(digest.inputHash).toBeSha256()

    expect(digest.docs).toHaveLength(2)
    expect(digest.docs[0]?.path).toBe(skill.docs[0])
    expect(digest.docs[0]?.contentHash).toBeSha256()
    expect(digest.docs[1]?.path).toBe(skill.docs[1])
    expect(digest.docs[1]?.contentHash).toBeSha256()

    expect(digest.definitionHash).toBeSha256()
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

  test.for([
    { name: 'description', skill: { ...skill, description: 'Migrate to v3 with this skill.' } },
    { name: 'documentation paths', skill: { ...skill, docs: ['./migrations/migrate-v2.md', './changelog.md'] } },
    { name: 'guidance', skill: { ...skill, guidance: 'Add a usage example to the generated skill.' } },
    { name: 'license', skill: { ...skill, license: 'MIT' } },
    {
      name: 'compatibility',
      skill: { ...skill, compatibility: 'Requires git, docker, jq, and access to the internet' },
    },
  ])('includes $name in the definition and input hashes', ({ skill: changedSkill }) => {
    const digest = computeSkillDigest('openai/gpt-5.6-luna', skill, docs)

    const changedDigest = computeSkillDigest('openai/gpt-5.6-luna', changedSkill, docs)

    expect(digest.inputHash).not.toBe(changedDigest.inputHash)
    expect(digest.definitionHash).not.toBe(changedDigest.definitionHash)
  })

  test('hashes non-definition input changes', () => {
    const digest = computeSkillDigest('openai/gpt-5.6-luna', skill, docs)

    const changedModelDigest = computeSkillDigest('openai/gpt-5.6-terra', skill, docs)

    expect(digest.inputHash).not.toBe(changedModelDigest.inputHash)
    expect(digest.definitionHash).toBe(changedModelDigest.definitionHash)

    const changedDocsDigest = computeSkillDigest('openai/gpt-5.6-luna', skill, docs.toReversed())

    expect(digest.inputHash).not.toBe(changedDocsDigest.inputHash)
    expect(digest.definitionHash).toBe(changedDocsDigest.definitionHash)
  })
})

describe('computeSkillFileDigest', () => {
  test('computes a skill file digest', () => {
    const digests = computeSkillFileDigest([
      { path: 'SKILL.md', content: 'Skill content.' },
      { path: 'references/details.md', content: 'Reference content.' },
    ])

    expect(digests.map(({ path }) => path)).toStrictEqual(['SKILL.md', 'references/details.md'])

    expect(digests[0]?.contentHash).toBeSha256()
    expect(digests[1]?.contentHash).toBeSha256()
  })

  test('normalizes content line endings', () => {
    const [lfDigest] = computeSkillFileDigest([{ path: 'SKILL.md', content: 'Foo\nBar' }])
    const [crlfDigest] = computeSkillFileDigest([{ path: 'SKILL.md', content: 'Foo\r\nBar' }])

    expect(lfDigest?.contentHash).toBe(crlfDigest?.contentHash)
  })
})

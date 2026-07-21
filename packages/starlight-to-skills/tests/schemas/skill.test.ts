import { describe, expect, test } from 'vitest'

import { parseSkillName, SkillDefinitionSchema } from '../../src/schemas/skill'

describe('name', () => {
  test.for(['a', 'skill-name'])('accepts valid skill name %j', (name) => {
    expect(() => parseSkillName(name)).not.toThrow()
  })

  test.for([
    '',
    'a'.repeat(65),
    'Skill-name',
    'skill_name',
    ' skill-name',
    'skill-name ',
    '-skill-name',
    'skill-name-',
    'skill--name',
  ])('rejects invalid skill name %j', (name) => {
    expect(() => parseSkillName(name)).toThrow()
  })
})

describe('definition', () => {
  const baseDefinition = {
    description: 'Do the thing.',
    docs: ['./getting-started.mdx', './guides/custom-thing.md'],
    guidance: 'Add a usage example to the generated skill.',
  }

  test('requires non-empty description', () => {
    const result = SkillDefinitionSchema.safeParse({ ...baseDefinition, description: '' })

    expect.assert(!result.success)

    expect(result.error.issues[0]?.path).toStrictEqual(['description'])
    expect(result.error.issues[0]?.message).toMatchInlineSnapshot(`"Too small: expected string to have >=1 characters"`)
  })

  test('requires at least one documentation source', () => {
    const result = SkillDefinitionSchema.safeParse({ ...baseDefinition, docs: [] })

    expect.assert(!result.success)

    expect(result.error.issues[0]?.path).toStrictEqual(['docs'])
    expect(result.error.issues[0]?.message).toMatchInlineSnapshot(`"Too small: expected array to have >=1 items"`)
  })

  test('rejects duplicate documentation sources', () => {
    const result = SkillDefinitionSchema.safeParse({
      ...baseDefinition,
      docs: ['./getting-started.mdx', './guides/custom-thing.md', './getting-started.mdx'],
    })

    expect.assert(!result.success)

    expect(result.error.issues[0]?.path).toStrictEqual(['docs', 2])
    expect(result.error.issues[0]?.message).toMatchInlineSnapshot(
      `"Duplicate documentation source path './getting-started.mdx'."`,
    )
  })

  test('rejects unsupported documentation source extensions', () => {
    const result = SkillDefinitionSchema.safeParse({ ...baseDefinition, docs: ['./getting-started.mdoc'] })

    expect.assert(!result.success)

    expect(result.error.issues[0]?.path).toStrictEqual(['docs', 0])
    expect(result.error.issues[0]?.message).toMatchInlineSnapshot(
      `"Documentation source must use a supported Markdown or MDX extension."`,
    )
  })
})

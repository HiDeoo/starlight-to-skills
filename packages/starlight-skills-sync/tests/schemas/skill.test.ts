import { expect, test } from 'vitest'

import { skillDefinitionSchema } from '../../src/schemas/skill'

const baseDefinition = {
  description: 'Do the thing.',
  docs: ['getting-started', 'guides/custom-thing'],
  guidance: 'Add a usage example to the generated skill.',
}

test('requires non-empty description', () => {
  const result = skillDefinitionSchema.safeParse({ ...baseDefinition, description: '' })

  expect(result.success).toBe(false)
})

test('requires at least one documentation source', () => {
  const result = skillDefinitionSchema.safeParse({ ...baseDefinition, docs: [] })

  expect(result.success).toBe(false)
})

test('rejects duplicate documentation sources', () => {
  const result = skillDefinitionSchema.safeParse({
    ...baseDefinition,
    docs: ['getting-started', 'guides/custom-thing', 'getting-started'],
  })

  expect(result.success).toBe(false)
  expect.assert(!result.success)

  expect(result.error.issues[0]).toMatchInlineSnapshot(`
    {
      "code": "custom",
      "message": "Duplicate documentation source ID 'getting-started'.",
      "path": [
        "docs",
        2,
      ],
    }
  `)
})

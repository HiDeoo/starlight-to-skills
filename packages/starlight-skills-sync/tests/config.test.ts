import { describe, expect, test } from 'vitest'

import { defineSkill, type SkillUserDefinition } from '../src/config'

describe('defineSkill', () => {
  test('returns the original definition unchanged', () => {
    const definition = {
      description: 'Do the thing.',
      docs: ['getting-started', 'guides/custom-thing'],
      guidance: 'Add a usage example to the generated skill.',
    } satisfies SkillUserDefinition

    const result = defineSkill(definition)

    expect(result.description).toBe(definition.description)
    expect(result.docs).toEqual(definition.docs)
    expect(result.guidance).toBe(definition.guidance)
  })
})

import { expect, test } from 'vitest'

import { defineSkill, type SkillUserDefinition } from '../src/skill'

test('returns the skill definition unchanged', () => {
  const definition = {
    description: 'Do the thing.',
    docs: ['getting-started', 'guides/custom-thing'],
    guidance: 'Add a usage example to the generated skill.',
  } satisfies SkillUserDefinition

  const result = defineSkill(definition)

  expect(result).toStrictEqual(definition)
})

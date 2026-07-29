import { expect, test } from 'vitest'

import { defineSkill, type SkillUserDefinition } from '../src/skill'

test('returns the skill definition unchanged', () => {
  const definition: SkillUserDefinition = {
    description: 'Do the thing.',
    docs: ['./getting-started.mdx', './guides/custom-thing.md'],
    guidance: 'Add a usage example to the generated skill.',
  }

  expect(defineSkill(definition)).toBe(definition)
})

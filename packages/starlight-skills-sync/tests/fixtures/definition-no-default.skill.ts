import { defineSkill } from '../../src/skill'

export const definition = defineSkill({
  description: 'Do the thing.',
  docs: ['./getting-started.mdx', './guides/custom-thing.md'],
  guidance: 'Add a usage example to the generated skill.',
})

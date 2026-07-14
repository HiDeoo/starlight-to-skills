import { defineSkill } from '../../src/config'

export default defineSkill({
  description: 'Do the thing.',
  // @ts-expect-error - testing an invalid definition
  documentation: ['getting-started', 'guides/custom-thing'],
})

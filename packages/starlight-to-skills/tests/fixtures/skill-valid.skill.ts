import { defineSkill } from '../../src/skill'

export default defineSkill({
  description: 'Do the thing.',
  docs: ['./getting-started.mdx', './guides/custom-thing.md'],
  guidance: 'Add a usage example to the generated skill.',
  license: 'MIT',
  compatibility: 'Requires git, docker, jq, and access to the internet',
  metadata: { author: 'example-org', version: '1.0' },
})

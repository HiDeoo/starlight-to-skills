import { stripVTControlCharacters } from 'node:util'

import type { SnapshotSerializer } from 'vitest'

import { StarlightToSkillsError } from '../src/libs/error'

export default {
  test(val) {
    return !!val && StarlightToSkillsError.is(val)
  },
  serialize({ message, hint }: StarlightToSkillsError) {
    return stripVTControlCharacters(`${message}${hint ? `\n\nHint: ${hint}` : ''}`)
  },
} satisfies SnapshotSerializer

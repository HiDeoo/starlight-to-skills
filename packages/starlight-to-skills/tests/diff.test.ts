import { stripVTControlCharacters } from 'node:util'

import { expect, test } from 'vitest'

import { renderSkillDiff } from '../src/libs/diff'

test('renders modified, unchanged, added, and removed files', () => {
  const approvedFiles = [
    { path: 'SKILL.md', content: 'Keep this line.\nDo something.\nRemoved line.' },
    { path: 'references/configuration.md', content: 'Same content.' },
    { path: 'references/deprecated.md', content: 'Deprecated content.' },
  ]

  const candidateFiles = [
    { path: 'SKILL.md', content: 'Keep this line.\nDo something.\nAdded line.' },
    { path: 'references/configuration.md', content: 'Same content.' },
    { path: 'references/experimental.md', content: 'Experimental content.' },
  ]

  expect(stripVTControlCharacters(renderSkillDiff(approvedFiles, candidateFiles))).toMatchInlineSnapshot(`
    " SKILL.md\u{20}

      Keep this line.
      Do something.
    - Removed line.
    + Added line.

     references/configuration.md\u{20}

      Same content.

     references/experimental.md\u{20}

    + Experimental content.

     references/deprecated.md\u{20}

    - Deprecated content."
  `)
})

test('normalizes line endings', () => {
  const approvedFiles = [{ path: 'SKILL.md', content: 'First.\r\nSecond.' }]
  const candidateFiles = [{ path: 'SKILL.md', content: 'First.\nSecond.' }]

  const output = stripVTControlCharacters(renderSkillDiff(approvedFiles, candidateFiles))

  expect(output).toMatchInlineSnapshot(`
    " SKILL.md\u{20}

      First.
      Second."
  `)

  expect(output).not.toContain('-')
  expect(output).not.toContain('+')
})

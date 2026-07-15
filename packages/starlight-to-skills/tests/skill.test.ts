import { describe, expect, test } from 'vitest'

import type { StarlightToSkillsConfig } from '../src/config'
import { discoverSkills, getSkillUrlByName } from '../src/libs/skill'

const rootDir = new URL('fixtures/', import.meta.url)

describe('discoverSkill', () => {
  test('discovers skill definitions', async () => {
    const skills = await discoverSkills({ rootDir, definitions: '*.skill.ts' } as StarlightToSkillsConfig)

    expect(skills).toStrictEqual([
      new URL('skill-invalid.skill.ts', rootDir),
      new URL('skill-no-default.skill.ts', rootDir),
      new URL('skill-valid.skill.ts', rootDir),
    ])
  })

  test('returns an empty list of definitions when no matches are found', async () => {
    const skills = await discoverSkills({ rootDir, definitions: './unknown/*.skill.ts' } as StarlightToSkillsConfig)

    expect(skills).toStrictEqual([])
  })
})

describe('getSkillUrlByName', () => {
  test('returns a skill definition URL', () => {
    const definitionUrl = new URL('skill-valid.skill.ts', rootDir)

    const result = getSkillUrlByName([definitionUrl, new URL('skill-invalid.skill.ts', rootDir)], 'skill-valid')

    expect(result).toBe(definitionUrl)
  })

  test('rejects an unknown skill name', () => {
    expect(() => getSkillUrlByName([], 'unknown')).toThrowErrorMatchingInlineSnapshot(
      `[Error: Failed to find skill definition 'unknown.skill.ts'.]`,
    )
  })

  test('rejects duplicate skill names', () => {
    expect(() =>
      getSkillUrlByName(
        [new URL('a/duplicate.skill.ts', rootDir), new URL('b/duplicate.skill.ts', rootDir)],
        'duplicate',
      ),
    ).toThrowErrorMatchingInlineSnapshot(`[Error: Found multiple skill definitions named 'duplicate.skill.ts'.]`)
  })
})

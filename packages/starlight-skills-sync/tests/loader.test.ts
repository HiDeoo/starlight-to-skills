import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { loadSkillDefinition } from '../src/libs/loader'

const fixturesPath = fileURLToPath(new URL('fixtures/', import.meta.url))

test('loads a skill definition and resolves its configuration', async () => {
  const definitionPath = path.resolve(fixturesPath, 'definition-valid.skill.ts')

  const configuration = await loadSkillDefinition(definitionPath)

  expect(configuration).toMatchObject({
    name: 'definition-valid',
    description: 'Do the thing.',
    docs: ['getting-started', 'guides/custom-thing'],
    guidance: 'Add a usage example to the generated skill.',
  })

  expect(configuration.path).toMatch(/[\\/]definition-valid\.skill\.ts$/)
})

test('rejects definition without a default export', async () => {
  const definitionPath = path.resolve(fixturesPath, 'definition-no-default-export.skill.ts')

  await expect(loadSkillDefinition(definitionPath)).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Invalid skill definition 'definition-no-default-export.skill.ts'.]`,
  )
})

test('rejects invalid definition', async () => {
  const definitionPath = path.resolve(fixturesPath, 'definition-invalid.skill.ts')

  await expect(loadSkillDefinition(definitionPath)).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Invalid skill definition 'definition-invalid.skill.ts'.]`,
  )
})

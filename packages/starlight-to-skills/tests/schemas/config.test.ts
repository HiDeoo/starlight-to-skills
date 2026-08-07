import { expect, test } from 'vitest'

import { ConfigSchema } from '../../src/schemas/config'

const baseConfig = {
  model: 'openai/gpt-5.6-luna',
}

test('requires non-empty model', () => {
  const result = ConfigSchema.safeParse({ ...baseConfig, model: '' })

  expect.assert(!result.success)

  expect(result.error.issues[0]?.path).toStrictEqual(['model'])
  expect(result.error.issues[0]?.message).toMatchInlineSnapshot(`"Too small: expected string to have >=1 characters"`)
})

test.for([
  { path: 'ai/skills', expected: 'ai/skills' },
  { path: '/ai/skills/', expected: 'ai/skills' },
])('normalizes catalog path %j', ({ path, expected }) => {
  expect(ConfigSchema.parse({ ...baseConfig, catalog: { path } }).catalog).toStrictEqual({ path: expected })
})

test.for(['', '/', '///'])('requires non-empty catalog path %j', (path) => {
  const result = ConfigSchema.safeParse({ ...baseConfig, catalog: { path } })

  expect.assert(!result.success)

  expect(result.error.issues[0]?.path).toStrictEqual(['catalog', 'path'])
  expect(result.error.issues[0]?.message).toMatchInlineSnapshot(`"Too small: expected string to have >=1 characters"`)
})

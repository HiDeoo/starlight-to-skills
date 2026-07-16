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

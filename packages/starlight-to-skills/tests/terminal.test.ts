import { stripVTControlCharacters } from 'node:util'

import { expect, test, vi } from 'vitest'

import { style } from '../src/libs/terminal'

const packageManager = vi.hoisted(() => ({ getUserAgent: vi.fn() }))

vi.mock('package-manager-detector', async (importOriginal) => {
  const packageManagerDetector = await importOriginal<typeof import('package-manager-detector')>()
  return { ...packageManagerDetector, getUserAgent: packageManager.getUserAgent }
})

test.for([
  { name: 'fallback', agent: null, expected: 'npx starlight-to-skills check' },
  { name: 'npm', agent: 'npm', expected: 'npx starlight-to-skills check' },
  { name: 'pnpm', agent: 'pnpm', expected: 'pnpm exec starlight-to-skills check' },
  { name: 'yarn', agent: 'yarn', expected: 'yarn exec starlight-to-skills -- check' },
])('reports commands for $name', ({ agent, expected }) => {
  packageManager.getUserAgent.mockReturnValue(agent)

  expect(stripVTControlCharacters(style.command('starlight-to-skills check'))).toBe(`'${expected}'`)
})

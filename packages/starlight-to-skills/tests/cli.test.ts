import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest'

import packageJson from '../package.json' with { type: 'json' }
import { runCli } from '../src/libs/cli'

describe('runCli', () => {
  let logSpy: MockInstance
  let errorSpy: MockInstance

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockReturnValue()
    errorSpy = vi.spyOn(console, 'error').mockReturnValue()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('prints help', () => {
    expect(runCli(['--help'])).toBe(0)

    expect(logSpy).toHaveBeenCalledOnce()
    expect(logSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Usage: starlight-to-skills <command> [options]

      Options:
        -h, --help     Show help
        -v, --version  Show version"
    `)
  })

  test('prints the version', () => {
    expect(runCli(['--version'])).toBe(0)

    expect(logSpy).toHaveBeenCalledOnce()
    expect(logSpy).toHaveBeenCalledWith(packageJson.version)
  })

  test('rejects a missing command', () => {
    expect(runCli([])).toBe(1)

    expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Missing command.

      Run 'starlight-to-skills --help' for more information."
    `)
  })

  test('rejects unknown commands', () => {
    expect(runCli(['test'])).toBe(1)

    expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Unknown command 'test'.

      Run 'starlight-to-skills --help' for more information."
    `)
  })

  test('rejects unknown options', () => {
    expect(runCli(['--test'])).toBe(1)

    expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Unknown option '--test'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--test"

      Run 'starlight-to-skills --help' for more information."
    `)
  })
})

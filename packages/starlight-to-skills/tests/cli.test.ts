import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest'

import packageJson from '../package.json' with { type: 'json' }
import { runCli } from '../src/libs/cli'

const mastra = vi.hoisted(() => ({
  generate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    generate(...args: unknown[]) {
      return mastra.generate(...args)
    }
  },
}))

let logSpy: MockInstance
let errorSpy: MockInstance

beforeEach(() => {
  mastra.generate.mockReset()
  logSpy = vi.spyOn(console, 'log').mockReturnValue()
  errorSpy = vi.spyOn(console, 'error').mockReturnValue()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('generic behavior', () => {
  test('prints help', async () => {
    expect(await runCli(['--help'])).toBe(0)

    expect(logSpy).toHaveBeenCalledOnce()
    expect(logSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Usage: starlight-to-skills <command> [options]

      Commands:
        generate <name>  Generate a Candidate for a skill

      Options:
        -h, --help     Show help
        -v, --version  Show version"
    `)
  })

  test('prints the version', async () => {
    expect(await runCli(['--version'])).toBe(0)

    expect(logSpy).toHaveBeenCalledOnce()
    expect(logSpy).toHaveBeenCalledWith(packageJson.version)
  })

  test('rejects a missing command', async () => {
    expect(await runCli([])).toBe(1)

    expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Missing command.

      Run 'starlight-to-skills --help' for more information."
    `)
  })

  test('rejects unknown commands', async () => {
    expect(await runCli(['test'])).toBe(1)

    expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Unknown command 'test'.

      Run 'starlight-to-skills --help' for more information."
    `)
  })

  test('rejects unknown options', async () => {
    expect(await runCli(['--test'])).toBe(1)

    expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Unknown option '--test'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--test"

      Run 'starlight-to-skills --help' for more information."
    `)
  })
})

describe('generate command', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starlight-to-skills-'))

    await fs.mkdir(path.join(testDir, 'src/content/docs'), { recursive: true })
    await fs.mkdir(path.join(testDir, 'src/skills'), { recursive: true })

    await Promise.all([
      fs.writeFile(
        path.join(testDir, 'starlight-to-skills.config.ts'),
        `export default { model: 'openai/gpt-5.6-luna' }`,
      ),
      fs.writeFile(
        path.join(testDir, 'src/skills/test-skill.skill.ts'),
        `export default {
  description: 'Migrate a project to v2.',
  docs: ['./guide.md'],
}`,
      ),
      fs.writeFile(
        path.join(testDir, 'src/content/docs/guide.md'),
        `---
title: V2 Migration Guide
---

Change foo to bar.

Then change baz to quux.`,
      ),
    ])
  })

  afterEach(async () => {
    await fs.rm(testDir, { force: true, recursive: true })
  })

  test('rejects missing skill name', async () => {
    expect(await runCli(['generate'])).toBe(1)

    expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Missing skill name for command 'generate'.

      Run 'starlight-to-skills --help' for more information."
    `)
  })

  test('rejects multiple skill names', async () => {
    expect(await runCli(['generate', 'foo', 'bar'])).toBe(1)

    expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Command 'generate' accepts only one skill name.

      Run 'starlight-to-skills --help' for more information."
    `)
  })

  test('generates a candidate', async () => {
    mastra.generate.mockResolvedValue({
      object: {
        data: {
          status: 'success',
          body: 'Change foo to bar and then change baz to quux.',
          references: [],
        },
      },
    })

    expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)

    const candidateDir = path.join(testDir, '.starlight-to-skills/test-skill')

    await expect(fs.readFile(path.join(candidateDir, 'SKILL.md'), 'utf8')).resolves.toMatchInlineSnapshot(`
      "---
      name: "test-skill"
      description: "Migrate a project to v2."
      ---

      Change foo to bar and then change baz to quux."
    `)

    await expect(fs.readFile(path.join(candidateDir, 'manifest.json'), 'utf8')).resolves.toMatchInlineSnapshot(`
      "{
        "inputHash": "e2c5e3db27acf3167584b31ca91d06e47a8bce9ccca453ab56fa4a1dcdf6c0c4",
        "files": [
          {
            "path": "SKILL.md",
            "contentHash": "ffeff7a3288f160a02a253f3a8d456d6fa8491fef71396070137c390a518cce0"
          }
        ]
      }"
    `)

    expect(logSpy.mock.lastCall?.[0]).toContain(candidateDir)
  })

  test('reports issues', async () => {
    mastra.generate
      .mockResolvedValueOnce({
        object: {
          data: {
            status: 'success',
            body: 'Change foo to bar and then change baz to quux.',
            references: [],
          },
        },
      })
      .mockResolvedValueOnce({
        object: {
          data: {
            status: 'error',
            issues: [
              {
                type: 'source-incomplete',
                docsPaths: ['./guide.md'],
                details: 'The migration steps are missing.',
              },
              {
                type: 'source-conflict',
                docsPaths: ['./guide.md'],
                details: 'The migration guide is for v3.',
              },
            ],
          },
        },
      })

    expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)

    const candidateDir = path.join(testDir, '.starlight-to-skills/test-skill')

    await expect(fs.stat(candidateDir)).resolves.toBeDefined()

    expect(await runCli(['generate', 'test-skill'], testDir)).toBe(1)

    expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Source incomplete: The migration steps are missing.
      Documentation sources: ./guide.md

      Source conflict: The migration guide is for v3.
      Documentation sources: ./guide.md"
    `)

    await expect(fs.stat(candidateDir)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

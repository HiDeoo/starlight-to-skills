import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ReadStream } from 'node:tty'
import { stripVTControlCharacters } from 'node:util'

import { beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest'

import packageJson from '../package.json' with { type: 'json' }
import { runCli } from '../src/libs/cli'
import type { SkillManifest } from '../src/schemas/manifest'

const mastra = vi.hoisted(() => ({
  generate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

const readline = vi.hoisted(() => {
  const close = vi.fn()
  const question = vi.fn<() => Promise<string>>()

  return { close, createInterface: vi.fn(() => ({ close, question })), question }
})

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    generate(...args: unknown[]) {
      return mastra.generate(...args)
    }
  },
}))

vi.mock('node:readline/promises', () => ({
  createInterface: readline.createInterface,
}))

let logSpy: MockInstance
let errorSpy: MockInstance

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockReturnValue()
  errorSpy = vi.spyOn(console, 'error').mockReturnValue()
  readline.close.mockClear()
  readline.createInterface.mockClear()
  readline.question.mockReset().mockResolvedValue('yes')

  return () => vi.restoreAllMocks()
})

const mastraGenerateSuccessResponse = {
  object: {
    data: {
      status: 'success',
      body: 'Change foo to bar and then change baz to quux.',
      references: [],
    },
  },
}

describe('usage', () => {
  test('prints help', async () => {
    expect(await runCli(['--help'])).toBe(0)

    expect(logSpy).toHaveBeenCalledOnce()
    expect(getLastLogMessage(logSpy)).toMatchInlineSnapshot(`
      "
        starlight-to-skills <command> [options]

         Commands\u0020
                approve  Approve a generated skill.
                  check  Check whether approved skills are up to date.
               generate  Generate a skill for review.
                  prune  Remove orphan approved skills.

         Global options\u0020
             -h, --help  Show this help message.
          -v, --version  Show the version number."
    `)
  })

  test.for(['approve', 'check', 'generate', 'prune'])('prints help for the %s command', async (command) => {
    expect(await runCli([command, '--help'])).toBe(0)

    expect(logSpy).toHaveBeenCalledOnce()

    const output = getLastLogMessage(logSpy)

    expect(output).toContain(`starlight-to-skills ${command}`)
    expect(output).toContain('--help')

    if (command === 'approve') expect(output).toContain('--existing')
    else expect(output).not.toContain('--existing')

    if (command === 'prune') expect(output).toContain('--yes')
    else expect(output).not.toContain('--yes')
  })

  test('prints the version', async () => {
    expect(await runCli(['--version'])).toBe(0)

    expect(logSpy).toHaveBeenCalledOnce()
    expect(getLastLogMessage(logSpy)).toBe(packageJson.version)
  })

  test('rejects a missing command', async () => {
    expect(await runCli([])).toBe(1)

    expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
      "Error: Missing command.

      Hint: Run 'starlight-to-skills --help' for more information."
    `)
  })

  test('rejects unknown commands', async () => {
    expect(await runCli(['test'])).toBe(1)

    expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
      "Error: Unknown command 'test'.

      Hint: Run 'starlight-to-skills --help' for more information."
    `)
  })

  test('rejects unknown options', async () => {
    expect(await runCli(['--test'])).toBe(1)

    expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
      "Error: Unknown option '--test'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--test"

      Hint: Run 'starlight-to-skills --help' for more information."
    `)
  })
})

describe('commands', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starlight-to-skills-'))

    await fs.mkdir(path.join(testDir, 'src/content/docs'), { recursive: true })
    await fs.mkdir(path.join(testDir, 'src/skills'), { recursive: true })

    await fs.writeFile(
      path.join(testDir, 'starlight-to-skills.config.ts'),
      `export default { model: 'openai/gpt-5.6-luna' }`,
    )
    await fs.writeFile(
      path.join(testDir, 'src/skills/test-skill.skill.ts'),
      `export default {
  description: 'Migrate a project to v2.',
  docs: ['./guide.md'],
}`,
    )
    await fs.writeFile(
      path.join(testDir, 'src/content/docs/guide.md'),
      `---
title: V2 Migration Guide
---

Change foo to bar.

Then change baz to quux.`,
    )

    mastra.generate.mockReset()
    mastra.generate.mockResolvedValue(mastraGenerateSuccessResponse)

    return () => fs.rm(testDir, { force: true, recursive: true })
  })

  async function addApprovedSkill(name: string) {
    await fs.writeFile(
      path.join(testDir, `src/skills/${name}.skill.ts`),
      `export default {
  description: 'Use ${name}.',
  docs: ['./${name}.md'],
}`,
    )
    await fs.writeFile(
      path.join(testDir, `src/content/docs/${name}.md`),
      `---
title: ${name}
---

Change foo to bar.`,
    )

    expect(await runCli(['generate', name], testDir)).toBe(0)
    expect(await runCli(['approve', name], testDir)).toBe(0)
  }

  async function writeSkill(name: string) {
    const skillDir = path.join(testDir, 'skills', name)
    const manifestPath = path.join(testDir, 'skills/.starlight-to-skills', `${name}.json`)

    await fs.mkdir(skillDir, { recursive: true })
    await fs.mkdir(path.dirname(manifestPath), { recursive: true })
    await fs.writeFile(manifestPath, '')

    return { skillDir, manifestPath }
  }

  describe('generate', () => {
    test('rejects missing skill name', async () => {
      expect(await runCli(['generate'])).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Command 'generate' requires a skill name.

        Hint: Run 'starlight-to-skills generate --help' for more information."
      `)
    })

    test('rejects multiple skill names', async () => {
      expect(await runCli(['generate', 'foo', 'bar'])).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Command 'generate' accepts only one skill name.

        Hint: Run 'starlight-to-skills generate --help' for more information."
      `)
    })

    test('rejects an invalid skill name', async () => {
      expect(await runCli(['generate', 'invalid--name'], testDir)).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Invalid skill name 'invalid--name'.

        Hint: Use 1-64 lowercase letters, numbers, or hyphens, without leading, trailing, or consecutive hyphens."
      `)
    })

    test('ignores an unrelated definition with an invalid name', async () => {
      await fs.writeFile(path.join(testDir, 'src/skills/invalid--name.skill.ts'), '')

      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
    })

    test('generates a candidate', async () => {
      mastra.generate.mockResolvedValueOnce({
        object: {
          data: {
            status: 'success',
            body: 'Change foo to bar and then change baz to quux.',
            references: [{ path: 'references/details.md', body: 'Additional details.' }],
          },
        },
      })

      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)

      const candidateDir = path.join(testDir, '.starlight-to-skills/test-skill')

      await expect(fs.stat(candidateDir)).resolves.toBeDefined()

      expect(getLastLogMessage(logSpy)).toMatchInlineSnapshot(`
        "Generated 'test-skill'.

         - SKILL.md
         - references/details.md"
      `)
    })

    test('reports issues', async () => {
      mastra.generate.mockResolvedValueOnce(mastraGenerateSuccessResponse).mockResolvedValueOnce({
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
                docsPaths: ['./guide.md', './changelog.md'],
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

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Could not generate 'test-skill'.

         Missing information\u0020

        The migration steps are missing.

        Documentation file:

         - ./guide.md

         Conflicting information\u0020

        The migration guide is for v3.

        Documentation files:

         - ./guide.md
         - ./changelog.md

        Hint: Resolve these issues and run 'starlight-to-skills generate test-skill' again."
      `)

      await expect(fs.stat(candidateDir)).rejects.toMatchObject({ code: 'ENOENT' })
    })
  })

  describe('approve', () => {
    test('rejects missing skill name', async () => {
      expect(await runCli(['approve'])).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Command 'approve' requires a skill name.

        Hint: Run 'starlight-to-skills approve --help' for more information."
      `)
    })

    test('rejects multiple skill names', async () => {
      expect(await runCli(['approve', 'foo', 'bar'])).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Command 'approve' accepts only one skill name.

        Hint: Run 'starlight-to-skills approve --help' for more information."
      `)
    })

    test('rejects --existing for commands other than approve', async () => {
      expect(await runCli(['generate', 'test-skill', '--existing'])).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Option '--existing' is only valid for command 'approve'.

        Hint: Run 'starlight-to-skills approve --help' for more information."
      `)
    })

    test('approves the current candidate', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)

      mastra.generate.mockClear()

      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)
      expect(mastra.generate).not.toHaveBeenCalled()

      const candidateDir = path.join(testDir, '.starlight-to-skills/test-skill')
      const skillDir = path.join(testDir, 'skills/test-skill')

      await expect(fs.stat(candidateDir)).resolves.toBeDefined()
      await expect(fs.stat(skillDir)).resolves.toBeDefined()

      expect(getLastLogMessage(logSpy)).toBe("Approved 'test-skill'.")

      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)
      expect(getLastLogMessage(logSpy)).toBe("Already approved 'test-skill'.")
    })

    test('rejects a missing candidate', async () => {
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: No generated skill found for 'test-skill'.

        Hint: Run 'starlight-to-skills generate test-skill'."
      `)
    })

    test('rejects an outdated candidate', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)

      await fs.appendFile(path.join(testDir, 'src/content/docs/guide.md'), '\nOne more step.')

      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Generated skill for 'test-skill' is out of date.

        Hint: Run 'starlight-to-skills generate test-skill' again."
      `)
    })

    describe('--existing', () => {
      test('approves an existing skill without changing the candidate', async () => {
        expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
        expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

        await fs.appendFile(path.join(testDir, 'src/content/docs/guide.md'), '\nOne more step.')
        expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)

        const candidateDir = path.join(testDir, '.starlight-to-skills/test-skill')
        const candidateBefore = await Promise.all([
          fs.readFile(path.join(candidateDir, 'SKILL.md'), 'utf8'),
          fs.readFile(path.join(candidateDir, 'manifest.json'), 'utf8'),
        ])

        mastra.generate.mockClear()

        expect(await runCli(['approve', 'test-skill', '--existing'], testDir)).toBe(0)
        expect(mastra.generate).not.toHaveBeenCalled()

        const candidateAfter = await Promise.all([
          fs.readFile(path.join(candidateDir, 'SKILL.md'), 'utf8'),
          fs.readFile(path.join(candidateDir, 'manifest.json'), 'utf8'),
        ])

        expect(candidateAfter).toStrictEqual(candidateBefore)
        expect(await runCli(['check', 'test-skill'], testDir)).toBe(0)
      })

      test('rejects approving a missing existing skill', async () => {
        expect(await runCli(['approve', 'test-skill', '--existing'], testDir)).toBe(1)

        expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
          "Error: No approved skill found for 'test-skill'.

          Hint: If needed, run 'starlight-to-skills generate test-skill', then run 'starlight-to-skills approve test-skill' without '--existing'."
        `)
      })

      test('rejects approving an outdated existing skill', async () => {
        expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
        expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

        const skillPath = path.join(testDir, 'skills/test-skill/SKILL.md')
        const manifestPath = path.join(testDir, 'skills/.starlight-to-skills/test-skill.json')

        const manifestBefore = await fs.readFile(manifestPath, 'utf8')

        await fs.appendFile(skillPath, '\nUpdate.')

        expect(await runCli(['approve', 'test-skill', '--existing'], testDir)).toBe(1)

        expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
          "Error: The following files in approved skill 'test-skill' have changed:

           - SKILL.md

          Hint: Restore the listed files. To keep intended changes, update the skill definition or documentation, run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'."
        `)

        await expect(fs.readFile(skillPath, 'utf8')).resolves.toContain('Update.')
        await expect(fs.readFile(manifestPath, 'utf8')).resolves.toBe(manifestBefore)
      })
    })
  })

  describe('check', () => {
    test('rejects multiple skill names', async () => {
      expect(await runCli(['check', 'foo', 'bar'])).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Command 'check' accepts only one skill name.

        Hint: Run 'starlight-to-skills check --help' for more information."
      `)
    })

    test('reports a never-approved skill', async () => {
      expect(await runCli(['check', 'test-skill'], testDir)).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Skill 'test-skill' has not been approved.

        Hint: Run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'."
      `)
    })

    test('checks an up-to-date skill', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      mastra.generate.mockClear()

      const writeFileSpy = vi.spyOn(fs, 'writeFile')
      const mkdirSpy = vi.spyOn(fs, 'mkdir')
      const rmSpy = vi.spyOn(fs, 'rm')

      expect(await runCli(['check', 'test-skill'], testDir)).toBe(0)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(getLastLogMessage(logSpy)).toMatchInlineSnapshot(`"Check complete: 'test-skill' is up to date."`)

      expect(writeFileSpy).not.toHaveBeenCalled()
      expect(mkdirSpy).not.toHaveBeenCalled()
      expect(rmSpy).not.toHaveBeenCalled()
    })

    test('reports skill issues', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      await fs.appendFile(path.join(testDir, 'src/content/docs/guide.md'), '\nOne more step.')
      await fs.writeFile(path.join(testDir, 'skills/test-skill/SKILL.md'), 'Updated skill.')

      expect(await runCli(['check', 'test-skill'], testDir)).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Skill 'test-skill' is not up to date.

         Documentation content changed\u0020

         - ./guide.md

         Approved skill changed\u0020

         - SKILL.md

        Hint: Restore the listed files. To keep intended changes, update the skill definition or documentation, run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'."
      `)
    })

    test('reports definition, model, and generation version changes', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      const manifestPath = path.join(testDir, 'skills/.starlight-to-skills/test-skill.json')
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as SkillManifest

      manifest.definitionHash = 'previous-definition-hash'
      manifest.model = 'openai/gpt-5.6-terra'
      manifest.generatorVersion = 0

      await fs.writeFile(manifestPath, JSON.stringify(manifest, undefined, 2))

      expect(await runCli(['check', 'test-skill'], testDir)).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
      "Error: Skill 'test-skill' is not up to date.

       Skill definition changed\u0020

      The description, documentation file paths, or guidance changed since the skill was approved.

       Model changed\u0020

       - Before: openai/gpt-5.6-terra
       - Now: openai/gpt-5.6-luna

       Generation version changed\u0020

       - Before: 0
       - Now: 1

      Hint: Run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'. Alternatively, if the existing approved skill is still valid, run 'starlight-to-skills approve test-skill --existing'."
    `)
    })

    test('hints to approve an existing skill', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      await fs.appendFile(path.join(testDir, 'src/content/docs/guide.md'), '\nOne more step.')

      expect(await runCli(['check', 'test-skill'], testDir)).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Skill 'test-skill' is not up to date.

         Documentation content changed\u0020

         - ./guide.md

        Hint: Run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'. Alternatively, if the existing approved skill is still valid, run 'starlight-to-skills approve test-skill --existing'."
      `)
    })

    test('checks a project with no skills', async () => {
      await fs.rm(path.join(testDir, 'src/skills/test-skill.skill.ts'))

      expect(await runCli(['check'], testDir)).toBe(0)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(getLastLogMessage(logSpy)).toMatchInlineSnapshot(`"Check complete: no skills found."`)
    })

    test('checks all up-to-date skills', async () => {
      await addApprovedSkill('other-skill')

      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      mastra.generate.mockClear()

      const writeFileSpy = vi.spyOn(fs, 'writeFile')
      const mkdirSpy = vi.spyOn(fs, 'mkdir')
      const rmSpy = vi.spyOn(fs, 'rm')

      expect(await runCli(['check'], testDir)).toBe(0)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(getLastLogMessage(logSpy)).toMatchInlineSnapshot(`"Check complete: all skills are up to date."`)

      expect(writeFileSpy).not.toHaveBeenCalled()
      expect(mkdirSpy).not.toHaveBeenCalled()
      expect(rmSpy).not.toHaveBeenCalled()
    })

    test('reports never-approved skills', async () => {
      await addApprovedSkill('other-skill')

      mastra.generate.mockClear()

      expect(await runCli(['check'], testDir)).toBe(1)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Not all skills are up to date.

         test-skill\u0020

        Skill 'test-skill' has not been approved.

        Hint: Run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'."
      `)
    })

    test('reports only skills with issues', async () => {
      await addApprovedSkill('other-skill')

      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      await fs.appendFile(path.join(testDir, 'src/content/docs/guide.md'), '\nOne more step.')

      mastra.generate.mockClear()

      expect(await runCli(['check'], testDir)).toBe(1)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Not all skills are up to date.

         test-skill\u0020

        Skill 'test-skill' is not up to date.

         Documentation content changed\u0020

         - ./guide.md

        Hint: Run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'. Alternatively, if the existing approved skill is still valid, run 'starlight-to-skills approve test-skill --existing'."
      `)
    })

    test('reports an invalid definition', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      await fs.writeFile(
        path.join(testDir, 'src/skills/invalid-skill.skill.ts'),
        `export default { description: '', docs: [] }`,
      )

      mastra.generate.mockClear()

      expect(await runCli(['check'], testDir)).toBe(1)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Not all skills are up to date.

         invalid-skill\u0020

        Invalid skill definition 'invalid-skill.skill.ts'.

        ✖ Too small: expected string to have >=1 characters
          → at description
        ✖ Too small: expected array to have >=1 items
          → at docs"
      `)
    })

    test('reports an invalid filename-derived skill name', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      await fs.writeFile(
        path.join(testDir, 'src/skills/invalid--skill.skill.ts'),
        `export default { description: 'Migrate a project to v2.', docs: ['./guide.md'] }`,
      )

      expect(await runCli(['check'], testDir)).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Not all skills are up to date.

         invalid--skill\u0020

        Invalid skill name 'invalid--skill'.

        Hint: Use 1-64 lowercase letters, numbers, or hyphens, without leading, trailing, or consecutive hyphens."
      `)
    })

    test('reports duplicate skill definitions', async () => {
      await fs.writeFile(
        path.join(testDir, 'starlight-to-skills.config.ts'),
        `export default { model: 'openai/gpt-5.6-luna', definitions: './src/skills/*/*.skill.ts' }`,
      )

      await fs.mkdir(path.join(testDir, 'src/skills/first'))
      await fs.mkdir(path.join(testDir, 'src/skills/second'))

      const definition = `export default { description: 'Migrate a project to v2.', docs: ['./guide.md'] }`

      await fs.writeFile(path.join(testDir, 'src/skills/first/duplicate.skill.ts'), definition)
      await fs.writeFile(path.join(testDir, 'src/skills/second/duplicate.skill.ts'), definition)

      mastra.generate.mockClear()

      expect(await runCli(['check'], testDir)).toBe(1)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Not all skills are up to date.

         duplicate\u0020

        Multiple skill definitions found for 'duplicate'.

        Hint: Keep only one skill definition named 'duplicate.skill.ts'."
      `)
    })

    test('reports orphan skills', async () => {
      await addApprovedSkill('first-orphan')
      await addApprovedSkill('second-orphan')

      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      await fs.rm(path.join(testDir, 'src/skills/first-orphan.skill.ts'))
      await fs.rm(path.join(testDir, 'src/skills/second-orphan.skill.ts'))
      mastra.generate.mockClear()

      const writeFileSpy = vi.spyOn(fs, 'writeFile')
      const mkdirSpy = vi.spyOn(fs, 'mkdir')
      const rmSpy = vi.spyOn(fs, 'rm')

      expect(await runCli(['check'], testDir)).toBe(1)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Not all skills are up to date.

         first-orphan\u0020

        Orphan approved skill.

         second-orphan\u0020

        Orphan approved skill.

        Hint: Run 'starlight-to-skills prune' to review and remove orphan approved skills."
      `)

      expect(writeFileSpy).not.toHaveBeenCalled()
      expect(mkdirSpy).not.toHaveBeenCalled()
      expect(rmSpy).not.toHaveBeenCalled()
    })

    test('reports an invalid manifest filename', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      await fs.writeFile(path.join(testDir, 'skills/.starlight-to-skills/...json'), '')

      expect(await runCli(['check'], testDir)).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Not all skills are up to date.

         ..\u0020

        Invalid skill name '..'.

        Hint: Use 1-64 lowercase letters, numbers, or hyphens, without leading, trailing, or consecutive hyphens."
      `)
    })
  })

  describe('prune', () => {
    test('rejects arguments', async () => {
      expect(await runCli(['prune', 'test-skill'])).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Command 'prune' accepts no arguments.

        Hint: Run 'starlight-to-skills prune --help' for more information."
      `)
    })

    test('rejects --yes for commands other than prune', async () => {
      expect(await runCli(['check', '--yes'])).toBe(1)

      expect(getLastLogMessage(errorSpy)).toMatchInlineSnapshot(`
        "Error: Option '--yes' is only valid for command 'prune'.

        Hint: Run 'starlight-to-skills prune --help' for more information."
      `)
    })

    test('prunes orphan skills', async () => {
      const orphanSkill = await writeSkill('orphan-skill')
      const testSkill = await writeSkill('test-skill')

      await fs.writeFile(path.join(testDir, 'src/skills/test-skill.skill.ts'), '')

      expect(await runCli(['prune', '--yes'], testDir)).toBe(0)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(readline.createInterface).not.toHaveBeenCalled()

      await expect(fs.stat(orphanSkill.skillDir)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(fs.stat(orphanSkill.manifestPath)).rejects.toMatchObject({ code: 'ENOENT' })

      await expect(fs.stat(testSkill.skillDir)).resolves.toBeDefined()
      await expect(fs.stat(testSkill.manifestPath)).resolves.toBeDefined()

      expect(getLogMessages(logSpy)).toStrictEqual([
        'Orphan approved skills:\n\n - orphan-skill\n',
        "Pruned 'orphan-skill'.",
      ])
    })

    test('does not prune when a definition filename has an invalid skill name', async () => {
      const orphanSkill = await writeSkill('orphan-skill')

      await fs.writeFile(path.join(testDir, 'src/skills/invalid--skill.skill.ts'), '')

      expect(await runCli(['prune', '--yes'], testDir)).toBe(1)

      await expect(fs.stat(orphanSkill.skillDir)).resolves.toBeDefined()
      await expect(fs.stat(orphanSkill.manifestPath)).resolves.toBeDefined()
    })

    test('does not prune when a manifest filename has an invalid skill name', async () => {
      const orphanSkill = await writeSkill('orphan-skill')

      await fs.writeFile(path.join(testDir, 'skills/.starlight-to-skills/...json'), '')

      expect(await runCli(['prune', '--yes'], testDir)).toBe(1)

      await expect(fs.stat(orphanSkill.skillDir)).resolves.toBeDefined()
      await expect(fs.stat(orphanSkill.manifestPath)).resolves.toBeDefined()
    })

    test('does not delete orphan skills when cancelling', async () => {
      vi.spyOn(process, 'stdin', 'get').mockReturnValue({ fd: 0, isTTY: true } as ReadStream & { fd: 0 })

      const orphanSkill = await writeSkill('orphan-skill')

      readline.question.mockResolvedValue('no')

      expect(await runCli(['prune'], testDir)).toBe(0)

      expect(readline.question).toHaveBeenCalledWith('Prune 1 orphan approved skill? [y/N] ')
      expect(readline.close).toHaveBeenCalledOnce()

      await expect(fs.stat(orphanSkill.skillDir)).resolves.toBeDefined()
      await expect(fs.stat(orphanSkill.manifestPath)).resolves.toBeDefined()

      expect(getLastLogMessage(logSpy)).toBe('Pruning cancelled.')
    })
  })
})

function getLogMessages(spy: MockInstance): string[] {
  return spy.mock.calls.map(([message]) => {
    if (typeof message !== 'string') throw new Error('Expected a string log message.')
    return stripVTControlCharacters(message)
  })
}

function getLastLogMessage(spy: MockInstance): string {
  const message = getLogMessages(spy).at(-1)
  if (message === undefined) throw new Error('Expected at least one log message.')
  return message
}

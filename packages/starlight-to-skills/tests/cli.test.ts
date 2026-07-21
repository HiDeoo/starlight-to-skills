import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest'

import packageJson from '../package.json' with { type: 'json' }
import { runCli } from '../src/libs/cli'

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
})

afterEach(() => {
  vi.restoreAllMocks()
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
    expect(logSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Usage: starlight-to-skills <command> [options]

      Commands:
        approve  <name>  Approve the current candidate for a skill
        check    [name]  Check whether one or all approved skills are up to date
        generate <name>  Generate a candidate for a skill
        prune            Remove orphan approved skills

      Options:
            --existing  Approve the existing approved skill
        -y, --yes       Skip confirmation
        -h, --help      Show help
        -v, --version   Show version"
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
  })

  afterEach(async () => {
    await fs.rm(testDir, { force: true, recursive: true })
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

    test('rejects an invalid skill name', async () => {
      expect(await runCli(['generate', 'invalid--name'], testDir)).toBe(1)

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(
        `"Invalid skill name 'invalid--name'. Skill name must be 1-64 characters, must only contain unicode lowercase alphanumeric characters and hyphens, must not start or end with a hyphen, and must not contain consecutive hyphens."`,
      )
    })

    test('ignores an unrelated definition with an invalid name', async () => {
      await fs.writeFile(path.join(testDir, 'src/skills/invalid--name.skill.ts'), '')

      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
    })

    test('generates a candidate', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)

      const candidateDir = path.join(testDir, '.starlight-to-skills/test-skill')

      await expect(fs.stat(candidateDir)).resolves.toBeDefined()
      expect(logSpy.mock.lastCall?.[0]).toContain(candidateDir)
      expect(logSpy.mock.lastCall?.[0]).toContain('Generated files:\n\n- SKILL.md')
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

  describe('approve', () => {
    test('rejects missing skill name', async () => {
      expect(await runCli(['approve'])).toBe(1)

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Missing skill name for command 'approve'.

        Run 'starlight-to-skills --help' for more information."
      `)
    })

    test('rejects multiple skill names', async () => {
      expect(await runCli(['approve', 'foo', 'bar'])).toBe(1)

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Command 'approve' accepts only one skill name.

        Run 'starlight-to-skills --help' for more information."
      `)
    })

    test('rejects --existing for commands other than approve', async () => {
      expect(await runCli(['generate', 'test-skill', '--existing'])).toBe(1)

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "Option '--existing' is only valid for command 'approve'.

      Run 'starlight-to-skills --help' for more information."
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

      expect(logSpy.mock.lastCall?.[0]).toContain(skillDir)
    })

    test('rejects a missing candidate', async () => {
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(1)

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(
        `"No candidate found for skill 'test-skill'. Run 'starlight-to-skills generate test-skill' first."`,
      )
    })

    test('rejects an outdated candidate', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)

      await fs.appendFile(path.join(testDir, 'src/content/docs/guide.md'), '\nOne more step.')

      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(1)

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(
        `"Candidate for skill 'test-skill' is outdated. Run 'starlight-to-skills generate test-skill' again."`,
      )
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

        expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`"Skill 'test-skill' has not yet been approved."`)
      })

      test('rejects approving an outdated existing skill', async () => {
        expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
        expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

        const skillPath = path.join(testDir, 'skills/test-skill/SKILL.md')
        const manifestPath = path.join(testDir, 'skills/.starlight-to-skills/test-skill.json')

        const manifestBefore = await fs.readFile(manifestPath, 'utf8')

        await fs.appendFile(skillPath, '\nUpdate.')

        expect(await runCli(['approve', 'test-skill', '--existing'], testDir)).toBe(1)

        expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`"The skill 'test-skill' has changed."`)

        await expect(fs.readFile(skillPath, 'utf8')).resolves.toContain('Update.')
        await expect(fs.readFile(manifestPath, 'utf8')).resolves.toBe(manifestBefore)
      })
    })
  })

  describe('check', () => {
    test('rejects multiple skill names', async () => {
      expect(await runCli(['check', 'foo', 'bar'])).toBe(1)

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Command 'check' accepts only one skill name.

        Run 'starlight-to-skills --help' for more information."
      `)
    })

    test('reports a never-approved skill', async () => {
      expect(await runCli(['check', 'test-skill'], testDir)).toBe(1)

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Issues:

        - Never approved

        Run 'starlight-to-skills generate test-skill' to generate a new candidate."
      `)
    })

    test('checks a current skill', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      mastra.generate.mockClear()

      const writeFileSpy = vi.spyOn(fs, 'writeFile')
      const mkdirSpy = vi.spyOn(fs, 'mkdir')
      const rmSpy = vi.spyOn(fs, 'rm')

      expect(await runCli(['check', 'test-skill'], testDir)).toBe(0)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(logSpy).toHaveBeenLastCalledWith('Ok')

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

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Issues:

        - Documentation source changed
        - Approved skill changed: SKILL.md

        Run 'starlight-to-skills generate test-skill' to generate a new candidate."
      `)
    })

    test('hints to approve an existing skill', async () => {
      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      await fs.appendFile(path.join(testDir, 'src/content/docs/guide.md'), '\nOne more step.')

      expect(await runCli(['check', 'test-skill'], testDir)).toBe(1)

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Issues:

        - Documentation source changed

        Run 'starlight-to-skills generate test-skill' to generate a new candidate.

        If the existing approved skill is still valid, run 'starlight-to-skills approve test-skill --existing'."
      `)
    })

    test('checks all current skills', async () => {
      await addApprovedSkill('other-skill')

      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      mastra.generate.mockClear()

      const writeFileSpy = vi.spyOn(fs, 'writeFile')
      const mkdirSpy = vi.spyOn(fs, 'mkdir')
      const rmSpy = vi.spyOn(fs, 'rm')

      expect(await runCli(['check'], testDir)).toBe(0)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(logSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "other-skill: Ok

        test-skill: Ok"
      `)

      expect(writeFileSpy).not.toHaveBeenCalled()
      expect(mkdirSpy).not.toHaveBeenCalled()
      expect(rmSpy).not.toHaveBeenCalled()
    })

    test('reports never-approved skills', async () => {
      await addApprovedSkill('other-skill')

      mastra.generate.mockClear()

      expect(await runCli(['check'], testDir)).toBe(1)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "other-skill: Ok

        test-skill: Issue

        Issues:

        - Never approved

        Run 'starlight-to-skills generate test-skill' to generate a new candidate."
      `)
    })

    test('reports all current skills with issues', async () => {
      await addApprovedSkill('other-skill')

      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      await fs.appendFile(path.join(testDir, 'src/content/docs/guide.md'), '\nOne more step.')

      mastra.generate.mockClear()

      expect(await runCli(['check'], testDir)).toBe(1)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "other-skill: Ok

        test-skill: Issue

        Issues:

        - Documentation source changed

        Run 'starlight-to-skills generate test-skill' to generate a new candidate.

        If the existing approved skill is still valid, run 'starlight-to-skills approve test-skill --existing'."
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

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "invalid-skill: Issue

        Invalid skill definition 'invalid-skill.skill.ts'.

        test-skill: Ok"
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

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "invalid--skill: Issue

        Invalid skill name 'invalid--skill'. Skill name must be 1-64 characters, must only contain unicode lowercase alphanumeric characters and hyphens, must not start or end with a hyphen, and must not contain consecutive hyphens.

        test-skill: Ok"
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

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "duplicate: Issue

        Found multiple skill definitions named 'duplicate.skill.ts'."
      `)
    })

    test('reports orphan skills', async () => {
      await addApprovedSkill('other-skill')

      expect(await runCli(['generate', 'test-skill'], testDir)).toBe(0)
      expect(await runCli(['approve', 'test-skill'], testDir)).toBe(0)

      await fs.rm(path.join(testDir, 'src/skills/other-skill.skill.ts'))
      mastra.generate.mockClear()

      const writeFileSpy = vi.spyOn(fs, 'writeFile')
      const mkdirSpy = vi.spyOn(fs, 'mkdir')
      const rmSpy = vi.spyOn(fs, 'rm')

      expect(await runCli(['check'], testDir)).toBe(1)
      expect(mastra.generate).not.toHaveBeenCalled()

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "test-skill: Ok

        other-skill: Issue

        Orphan approved skill."
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

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "test-skill: Ok

        ..: Issue

        Invalid skill name '..'. Skill name must be 1-64 characters, must only contain unicode lowercase alphanumeric characters and hyphens, must not start or end with a hyphen, and must not contain consecutive hyphens."
      `)
    })
  })

  describe('prune', () => {
    test('rejects arguments', async () => {
      expect(await runCli(['prune', 'test-skill'])).toBe(1)

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Command 'prune' accepts no arguments.

        Run 'starlight-to-skills --help' for more information."
      `)
    })

    test('rejects --yes for commands other than prune', async () => {
      expect(await runCli(['check', '--yes'])).toBe(1)

      expect(errorSpy.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        "Option '--yes' is only valid for command 'prune'.

        Run 'starlight-to-skills --help' for more information."
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

      expect(logSpy.mock.calls).toStrictEqual([
        ['Orphan approved skills:\n\n- orphan-skill'],
        ["Pruned orphan approved skill 'orphan-skill'."],
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
      vi.spyOn(process, 'stdin', 'get').mockReturnValue({ fd: 0, isTTY: true } as NodeJS.ReadStream & { fd: 0 })

      const orphanSkill = await writeSkill('orphan-skill')

      readline.question.mockResolvedValue('no')

      expect(await runCli(['prune'], testDir)).toBe(0)

      expect(readline.question).toHaveBeenCalledWith('Prune 1 orphan approved skills? [y/N] ')
      expect(readline.close).toHaveBeenCalledOnce()

      await expect(fs.stat(orphanSkill.skillDir)).resolves.toBeDefined()
      await expect(fs.stat(orphanSkill.manifestPath)).resolves.toBeDefined()

      expect(logSpy).toHaveBeenLastCalledWith('Pruning cancelled.')
    })
  })
})

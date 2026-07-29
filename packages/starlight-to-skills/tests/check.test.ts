import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { beforeEach, describe, expect, test } from 'vitest'

import { approveCandidate, createCandidate } from '../src/libs/candidate'
import { checkSkills, getSkillIssues } from '../src/libs/check'
import { loadSkillInputs } from '../src/libs/loader'
import type { SkillManifest } from '../src/schemas/manifest'

let testDir: string
let rootDir: URL

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starlight-to-skills-'))
  rootDir = pathToFileURL(`${testDir}${path.sep}`)

  await fs.mkdir(path.join(testDir, 'src/content/docs'), { recursive: true })
  await fs.mkdir(path.join(testDir, 'src/skills'), { recursive: true })

  await fs.writeFile(
    path.join(testDir, 'starlight-to-skills.config.ts'),
    `export default { model: 'openai/gpt-5.6-luna' }`,
  )
  await writeSkillDefinition('test-skill', 'Migrate a project to v2.', './guide.md')

  await fs.writeFile(
    path.join(testDir, 'src/content/docs/guide.md'),
    `---
title: V2 Migration Guide
---

Change foo to bar.

Then change baz to quux.`,
  )

  return () => fs.rm(testDir, { force: true, recursive: true })
})

describe('getSkillIssues', () => {
  test('checks an up-to-date skill', async () => {
    const { config, definition, digest } = await approveSkill('test-skill')

    await expect(getSkillIssues(config, definition, digest)).resolves.toBeUndefined()
  })

  test('reports a never-approved skill', async () => {
    const { config, definition, digest } = await loadSkillInputs('test-skill', rootDir)

    await expect(getSkillIssues(config, definition, digest)).resolves.toMatchInlineSnapshot(`
      Skill 'test-skill' has not been approved.

      Hint: Run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'.
    `)
  })

  test('reports skill issues', async () => {
    await approveSkill('test-skill')

    await fs.appendFile(path.join(testDir, 'src/content/docs/guide.md'), '\nOne more step.')
    await fs.writeFile(path.join(testDir, 'skills/test-skill/SKILL.md'), 'Updated skill.')

    const { config, definition, digest } = await loadSkillInputs('test-skill', rootDir)

    await expect(getSkillIssues(config, definition, digest)).resolves.toMatchInlineSnapshot(`
      Skill 'test-skill' is not up to date.

       Documentation content changed\u0020

       - ./guide.md

       Approved skill changed\u0020

       - SKILL.md

      Hint: Restore the listed files. To keep intended changes, update the skill definition or documentation, run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'.
    `)
  })

  test('reports definition, model, and generator version changes', async () => {
    const { config, definition, digest } = await approveSkill('test-skill')

    const manifestPath = path.join(testDir, 'skills/.starlight-to-skills/test-skill.json')

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as SkillManifest
    manifest.definitionHash = 'previous-definition-hash'
    manifest.model = 'openai/gpt-5.6-terra'
    manifest.generatorVersion = 0

    await fs.writeFile(manifestPath, JSON.stringify(manifest, undefined, 2))

    await expect(getSkillIssues(config, definition, digest)).resolves.toMatchInlineSnapshot(`
      Skill 'test-skill' is not up to date.

       Skill definition changed\u0020

      The description, documentation file paths, or guidance changed since the skill was approved.

       Model changed\u0020

       - Before: openai/gpt-5.6-terra
       - Now: openai/gpt-5.6-luna

       Generator version changed\u0020

       - Before: 0
       - Now: 1

      Hint: Run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'. Alternatively, if the existing approved skill is still valid, run 'starlight-to-skills approve test-skill --existing'.
    `)
  })

  test('hints to approve an existing skill', async () => {
    await approveSkill('test-skill')

    await fs.appendFile(path.join(testDir, 'src/content/docs/guide.md'), '\nOne more step.')

    const { config, definition, digest } = await loadSkillInputs('test-skill', rootDir)

    await expect(getSkillIssues(config, definition, digest)).resolves.toMatchInlineSnapshot(`
      Skill 'test-skill' is not up to date.

       Documentation content changed\u0020

       - ./guide.md

      Hint: Run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'. Alternatively, if the existing approved skill is still valid, run 'starlight-to-skills approve test-skill --existing'.
    `)
  })
})

describe('checkSkills', () => {
  test('checks a project with no skills', async () => {
    await fs.rm(path.join(testDir, 'src/skills/test-skill.skill.ts'))

    await expect(checkSkills(rootDir)).resolves.toBe('Check complete: no skills found.')
  })

  test('checks all up-to-date skills', async () => {
    await addApprovedSkill('other-skill')
    await approveSkill('test-skill')

    await expect(checkSkills(rootDir)).resolves.toBe('Check complete: all skills are up to date.')
  })

  test('reports never-approved skills', async () => {
    await addApprovedSkill('other-skill')

    await expect(checkSkills(rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       test-skill\u0020

      Skill 'test-skill' has not been approved.

      Hint: Run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'.
    `)
  })

  test('reports only skills with issues', async () => {
    await addApprovedSkill('other-skill')
    await approveSkill('test-skill')

    await fs.appendFile(path.join(testDir, 'src/content/docs/guide.md'), '\nOne more step.')

    await expect(checkSkills(rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       test-skill\u0020

      Skill 'test-skill' is not up to date.

       Documentation content changed\u0020

       - ./guide.md

      Hint: Run 'starlight-to-skills generate test-skill', review the generated skill, and then run 'starlight-to-skills approve test-skill'. Alternatively, if the existing approved skill is still valid, run 'starlight-to-skills approve test-skill --existing'.
    `)
  })

  test('reports an invalid definition', async () => {
    await approveSkill('test-skill')

    await fs.writeFile(
      path.join(testDir, 'src/skills/invalid-skill.skill.ts'),
      `export default { description: '', docs: [] }`,
    )

    await expect(checkSkills(rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       invalid-skill\u0020

      Invalid skill definition 'invalid-skill.skill.ts'.

      ✖ Too small: expected string to have >=1 characters
        → at description
      ✖ Too small: expected array to have >=1 items
        → at docs
    `)
  })

  test('reports an invalid skill name', async () => {
    await approveSkill('test-skill')

    await fs.writeFile(
      path.join(testDir, 'src/skills/invalid--skill.skill.ts'),
      `export default { description: 'Migrate a project to v2.', docs: ['./guide.md'] }`,
    )

    await expect(checkSkills(rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       invalid--skill\u0020

      Invalid skill name 'invalid--skill'.

      Hint: Use 1-64 lowercase letters, numbers, or hyphens, without leading, trailing, or consecutive hyphens.
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

    await expect(checkSkills(rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       duplicate\u0020

      Multiple skill definitions found for 'duplicate'.

      Hint: Keep only one skill definition named 'duplicate.skill.ts'.
    `)
  })

  test('reports orphan skills', async () => {
    await addApprovedSkill('first-orphan')
    await addApprovedSkill('second-orphan')
    await approveSkill('test-skill')

    await fs.rm(path.join(testDir, 'src/skills/first-orphan.skill.ts'))
    await fs.rm(path.join(testDir, 'src/skills/second-orphan.skill.ts'))

    await expect(checkSkills(rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       first-orphan\u0020

      Orphan approved skill.

       second-orphan\u0020

      Orphan approved skill.

      Hint: Run 'starlight-to-skills prune' to review and remove orphan approved skills.
    `)

    await expect(fs.stat(path.join(testDir, 'skills/first-orphan'))).resolves.toBeDefined()
    await expect(fs.stat(path.join(testDir, 'skills/.starlight-to-skills/first-orphan.json'))).resolves.toBeDefined()
  })

  test('reports an invalid manifest filename', async () => {
    await approveSkill('test-skill')

    await fs.writeFile(path.join(testDir, 'skills/.starlight-to-skills/...json'), '')

    await expect(checkSkills(rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       ..\u0020

      Invalid skill name '..'.

      Hint: Use 1-64 lowercase letters, numbers, or hyphens, without leading, trailing, or consecutive hyphens.
    `)
  })
})

async function writeSkillDefinition(name: string, description: string, docPath: string) {
  await fs.writeFile(
    path.join(testDir, `src/skills/${name}.skill.ts`),
    `export default {
  description: '${description}',
  docs: ['${docPath}'],
}`,
  )
}

async function approveSkill(name: string) {
  const inputs = await loadSkillInputs(name, rootDir)

  const candidate = createCandidate(inputs.digest.inputHash, [
    {
      path: 'SKILL.md',
      content: `---
name: ${name}
description: ${inputs.definition.description}
---

Follow the documentation.`,
    },
  ])

  await approveCandidate(inputs.config, inputs.definition, inputs.digest, candidate)

  return inputs
}

async function addApprovedSkill(name: string) {
  const docPath = `./${name}.md`

  await writeSkillDefinition(name, `Use ${name}.`, docPath)

  await fs.writeFile(
    path.join(testDir, 'src/content/docs', `${name}.md`),
    `---
title: ${name}
---

# ${name}`,
  )

  await approveSkill(name)
}

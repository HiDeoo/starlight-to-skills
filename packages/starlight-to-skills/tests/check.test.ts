import fs from 'node:fs/promises'

import { describe, expect } from 'vitest'

import { checkSkills, getSkillIssues } from '../src/libs/check'
import { computeSkillDigest } from '../src/libs/digest'
import { loadSkillInputs } from '../src/libs/loader'
import type { SkillManifest } from '../src/schemas/manifest'

import { test, type TestProject } from './project'

let project: TestProject

test.beforeEach(async ({ project: testProject }) => {
  project = testProject

  await writeSkillDefinition('test-skill', 'Migrate a project to v2.', './guide.md')

  await project.write(
    'src/content/docs/guide.md',
    `---
title: V2 Migration Guide
---

Change foo to bar.

Then change baz to quux.`,
  )
})

describe('getSkillIssues', () => {
  test('checks an up-to-date skill', async () => {
    const { config, definition, digest } = await approveSkill('test-skill')

    await expect(getSkillIssues(config, definition, digest)).resolves.toBeUndefined()
  })

  test('reports a never-approved skill', async () => {
    const { config, definition, digest } = await loadSkillInputs('test-skill', project.rootDir)

    await expect(getSkillIssues(config, definition, digest)).resolves.toMatchInlineSnapshot(`
      Skill 'test-skill' has not been approved.

      Hint: Run 'pnpm exec starlight-to-skills generate test-skill', review the generated skill, and then run 'pnpm exec starlight-to-skills approve test-skill'.
    `)
  })

  test('reports skill issues', async () => {
    await approveSkill('test-skill')

    await project.append('src/content/docs/guide.md', '\nOne more step.')
    await project.write('skills/test-skill/SKILL.md', 'Updated skill.')

    const { config, definition, digest } = await loadSkillInputs('test-skill', project.rootDir)

    await expect(getSkillIssues(config, definition, digest)).resolves.toMatchInlineSnapshot(`
      Skill 'test-skill' is not up to date.

       Documentation content changed\u{20}

       - ./guide.md

       Approved skill changed\u{20}

       - SKILL.md

      Hint: Restore the listed files. To keep intended changes, update the skill definition or documentation, run 'pnpm exec starlight-to-skills generate test-skill', review the generated skill, and then run 'pnpm exec starlight-to-skills approve test-skill'.
    `)
  })

  test('reports definition, model, and generator version changes', async () => {
    const { config, definition, digest } = await approveSkill('test-skill')

    const manifestPath = 'skills/.starlight-to-skills/test-skill.json'

    const manifest = JSON.parse(await project.read(manifestPath)) as SkillManifest
    manifest.definitionHash = 'previous-definition-hash'
    manifest.model = 'openai/gpt-5.6-terra'
    manifest.generatorVersion = 0

    await project.write(manifestPath, JSON.stringify(manifest, undefined, 2))

    await expect(getSkillIssues(config, definition, digest)).resolves.toMatchInlineSnapshot(`
      Skill 'test-skill' is not up to date.

       Skill definition changed\u{20}

      The description, license, compatibility, metadata, documentation file paths, or guidance changed since the skill was approved.

       Model changed\u{20}

       - Before: openai/gpt-5.6-terra
       - Now: openai/gpt-5.6-luna

       Generator version changed\u{20}

       - Before: 0
       - Now: 1

      Hint: Run 'pnpm exec starlight-to-skills generate test-skill', review the generated skill, and then run 'pnpm exec starlight-to-skills approve test-skill'. Alternatively, if the existing approved skill is still valid, run 'pnpm exec starlight-to-skills approve test-skill --existing'.
    `)
  })

  test('hints to approve an existing skill', async () => {
    await approveSkill('test-skill')

    await project.append('src/content/docs/guide.md', '\nOne more step.')

    const { config, definition, digest } = await loadSkillInputs('test-skill', project.rootDir)

    await expect(getSkillIssues(config, definition, digest)).resolves.toMatchInlineSnapshot(`
      Skill 'test-skill' is not up to date.

       Documentation content changed\u{20}

       - ./guide.md

      Hint: Run 'pnpm exec starlight-to-skills generate test-skill', review the generated skill, and then run 'pnpm exec starlight-to-skills approve test-skill'. Alternatively, if the existing approved skill is still valid, run 'pnpm exec starlight-to-skills approve test-skill --existing'.
    `)
  })

  test.for([
    { name: 'license', change: { license: 'MIT' } },
    {
      name: 'compatibility',
      change: { compatibility: 'Requires git, docker, jq, and access to the internet' },
    },
    { name: 'metadata', change: { metadata: { author: 'example-org', version: '1.0' } } },
  ])('does not hint to approve an existing skill after a $name change', async ({ change }) => {
    const { config, definition, docs } = await approveSkill('test-skill')

    const changedDefinition = { ...definition, ...change }
    const changedDigest = computeSkillDigest(config.model, changedDefinition, docs)

    await expect(getSkillIssues(config, changedDefinition, changedDigest)).resolves.toMatchInlineSnapshot(`
      Skill 'test-skill' is not up to date.

       Skill definition changed\u{20}

      The description, license, compatibility, metadata, documentation file paths, or guidance changed since the skill was approved.

      Hint: Run 'pnpm exec starlight-to-skills generate test-skill', review the generated skill, and then run 'pnpm exec starlight-to-skills approve test-skill'.
    `)
  })
})

describe('checkSkills', () => {
  test('checks a project with no skills', async () => {
    await fs.rm(project.path('src/skills/test-skill.skill.ts'))

    await expect(checkSkills(project.rootDir)).resolves.toBe('Check complete: no skills found.')
  })

  test('checks all up-to-date skills', async () => {
    await addApprovedSkill('other-skill')
    await approveSkill('test-skill')

    await expect(checkSkills(project.rootDir)).resolves.toBe('Check complete: all skills are up to date.')
  })

  test('reports never-approved skills', async () => {
    await addApprovedSkill('other-skill')

    await expect(checkSkills(project.rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       test-skill\u{20}

      Skill 'test-skill' has not been approved.

      Hint: Run 'pnpm exec starlight-to-skills generate test-skill', review the generated skill, and then run 'pnpm exec starlight-to-skills approve test-skill'.
    `)
  })

  test('reports only skills with issues', async () => {
    await addApprovedSkill('other-skill')
    await approveSkill('test-skill')

    await project.append('src/content/docs/guide.md', '\nOne more step.')

    await expect(checkSkills(project.rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       test-skill\u{20}

      Skill 'test-skill' is not up to date.

       Documentation content changed\u{20}

       - ./guide.md

      Hint: Run 'pnpm exec starlight-to-skills generate test-skill', review the generated skill, and then run 'pnpm exec starlight-to-skills approve test-skill'. Alternatively, if the existing approved skill is still valid, run 'pnpm exec starlight-to-skills approve test-skill --existing'.
    `)
  })

  test('reports an invalid definition', async () => {
    await approveSkill('test-skill')

    await project.write('src/skills/invalid-skill.skill.ts', `export default { description: '', docs: [] }`)

    await expect(checkSkills(project.rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       invalid-skill\u{20}

      Invalid skill definition 'invalid-skill.skill.ts'.

      ✖ Too small: expected string to have >=1 characters
        → at description
      ✖ Too small: expected array to have >=1 items
        → at docs
    `)
  })

  test('reports an invalid skill name', async () => {
    await approveSkill('test-skill')

    await project.write(
      'src/skills/invalid--skill.skill.ts',
      `export default { description: 'Migrate a project to v2.', docs: ['./guide.md'] }`,
    )

    await expect(checkSkills(project.rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       invalid--skill\u{20}

      Invalid skill name 'invalid--skill'.

      Hint: Use 1-64 lowercase letters, numbers, or hyphens, without leading, trailing, or consecutive hyphens.
    `)
  })

  test('reports orphan skills', async () => {
    await addApprovedSkill('first-orphan')
    await addApprovedSkill('second-orphan')
    await approveSkill('test-skill')

    await fs.rm(project.path('src/skills/first-orphan.skill.ts'))
    await fs.rm(project.path('src/skills/second-orphan.skill.ts'))

    await expect(checkSkills(project.rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       first-orphan\u{20}

      Orphan approved skill.

       second-orphan\u{20}

      Orphan approved skill.

      Hint: Run 'pnpm exec starlight-to-skills prune' to review and remove orphan approved skills.
    `)

    await expect(project.exists('skills/first-orphan')).resolves.toBe(true)
    await expect(project.exists('skills/.starlight-to-skills/first-orphan.json')).resolves.toBe(true)
  })

  test('reports an invalid manifest filename', async () => {
    await approveSkill('test-skill')

    await project.write('skills/.starlight-to-skills/...json', '')

    await expect(checkSkills(project.rootDir)).rejects.toMatchInlineSnapshot(`
      Not all skills are up to date.

       ..\u{20}

      Invalid skill name '..'.

      Hint: Use 1-64 lowercase letters, numbers, or hyphens, without leading, trailing, or consecutive hyphens.
    `)
  })
})

async function writeSkillDefinition(name: string, description: string, docPath: string) {
  await project.write(
    `src/skills/${name}.skill.ts`,
    `export default {
  description: '${description}',
  docs: ['${docPath}'],
}`,
  )
}

async function approveSkill(name: string) {
  const inputs = await loadSkillInputs(name, project.rootDir)

  await project.approveSkill(name, [
    {
      path: 'SKILL.md',
      content: `---
name: ${name}
description: ${inputs.definition.description}
---

Follow the documentation.`,
    },
  ])

  return inputs
}

async function addApprovedSkill(name: string) {
  const docPath = `./${name}.md`

  await writeSkillDefinition(name, `Use ${name}.`, docPath)

  await project.write(
    `src/content/docs/${name}.md`,
    `---
title: ${name}
---

# ${name}`,
  )

  await approveSkill(name)
}

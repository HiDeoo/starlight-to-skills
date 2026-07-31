import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { test as baseTest } from 'vitest'

import { approveCandidate, createCandidate } from '../src/libs/candidate'
import type { SkillFile } from '../src/libs/content'
import { pathExists, pathToDirectoryUrl } from '../src/libs/fs'
import { loadSkillInputs } from '../src/libs/loader'

// eslint-disable-next-line no-empty-pattern
export const test = baseTest.extend('project', async ({}, { onCleanup }) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'starlight-to-skills-'))
  const rootDir = pathToDirectoryUrl(rootPath)

  onCleanup(() => fs.rm(rootPath, { force: true, recursive: true }))

  function resolvePath(relativePath: string): string {
    return path.join(rootPath, relativePath)
  }

  async function write(relativePath: string, content: string) {
    const filePath = resolvePath(relativePath)

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content)
  }

  function read(relativePath: string) {
    return fs.readFile(resolvePath(relativePath), 'utf8')
  }

  async function append(relativePath: string, content: string) {
    await fs.appendFile(resolvePath(relativePath), content)
  }

  function exists(relativePath: string) {
    return pathExists(resolvePath(relativePath))
  }

  async function approveSkill(name: string, files: SkillFile[]) {
    const inputs = await loadSkillInputs(name, rootDir)
    const candidate = createCandidate(inputs.digest.inputHash, files)

    await approveCandidate(inputs.config, inputs.definition, inputs.digest, candidate)

    return inputs
  }

  await fs.mkdir(resolvePath('src/content/docs'), { recursive: true })
  await fs.mkdir(resolvePath('src/skills'), { recursive: true })

  await write('starlight-to-skills.config.ts', `export default { model: 'openai/gpt-5.6-luna' }`)

  return { rootDir, rootPath, path: resolvePath, write, read, append, exists, approveSkill }
})

export interface TestProject {
  append: (relativePath: string, content: string) => Promise<void>
  approveSkill: (name: string, files: SkillFile[]) => Promise<Awaited<ReturnType<typeof loadSkillInputs>>>
  exists: (relativePath: string) => Promise<boolean>
  path: (relativePath: string) => string
  read: (relativePath: string) => Promise<string>
  rootDir: URL
  rootPath: string
  write: (relativePath: string, content: string) => Promise<void>
}

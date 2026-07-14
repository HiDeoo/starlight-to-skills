import { glob } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { StarlightSkillsSyncConfig } from '../schemas/config'

export const SkillDefinitionSuffix = '.skill.ts'

export async function discoverSkills(config: StarlightSkillsSyncConfig): Promise<URL[]> {
  const definitionUrls: URL[] = []

  for await (const entry of glob(config.definitions, { cwd: fileURLToPath(config.rootDir), withFileTypes: true })) {
    if (!entry.isFile()) continue

    definitionUrls.push(pathToFileURL(path.join(entry.parentPath, entry.name)))
  }

  return definitionUrls.toSorted()
}

export function getSkillUrlByName(definitionUrls: URL[], name: string): URL {
  const filename = `${name}${SkillDefinitionSuffix}`

  const matchingUrls = definitionUrls.filter((url) => path.basename(fileURLToPath(url)) === filename)
  const [matchingUrl] = matchingUrls

  if (!matchingUrl) throw new Error(`Failed to find skill definition '${filename}'.`)
  if (matchingUrls.length > 1) throw new Error(`Found multiple skill definitions named '${filename}'.`)

  return matchingUrl
}

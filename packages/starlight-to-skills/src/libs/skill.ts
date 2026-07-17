import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { StarlightToSkillsConfig } from '../schemas/config'
import { SkillManifestSchema, type SkillManifest } from '../schemas/manifest'

import { computeSkillFileDigest } from './digest'
import { getSkillManifestUrl, isFileNotFoundError, resolveDirectoryUrl } from './fs'

export const SkillDefinitionSuffix = '.skill.ts'

export async function discoverSkillDefinitions(config: StarlightToSkillsConfig): Promise<URL[]> {
  const definitionUrls: URL[] = []

  for await (const entry of fs.glob(config.definitions, { cwd: fileURLToPath(config.rootDir), withFileTypes: true })) {
    if (!entry.isFile()) continue

    definitionUrls.push(pathToFileURL(path.join(entry.parentPath, entry.name)))
  }

  return definitionUrls.toSorted()
}

export function getSkillDefinitionUrlByName(definitionUrls: URL[], name: string): URL {
  const filename = `${name}${SkillDefinitionSuffix}`

  const matchingUrls = definitionUrls.filter((url) => path.basename(fileURLToPath(url)) === filename)
  const [matchingUrl] = matchingUrls

  if (!matchingUrl) throw new Error(`Failed to find skill definition '${filename}'.`)
  if (matchingUrls.length > 1) throw new Error(`Found multiple skill definitions named '${filename}'.`)

  return matchingUrl
}

export async function loadSkillManifest(url: URL, name: string): Promise<SkillManifest> {
  try {
    const data: unknown = JSON.parse(await fs.readFile(url, 'utf8'))
    const manifest = SkillManifestSchema.parse(data)
    if (manifest.name !== name) throw new Error(`Invalid manifest for skill '${name}': invalid name.`)
    return manifest
  } catch {
    throw new Error(`Invalid manifest for skill '${name}'.`)
  }
}

export async function loadSkill(outputDir: URL, name: string) {
  const skillUrl = resolveDirectoryUrl(name, outputDir)
  const manifest = await loadSkillManifest(getSkillManifestUrl(outputDir, name), name)
  const fileMismatches: string[] = []

  for (const file of manifest.files) {
    const fileUrl = new URL(file.path, skillUrl)
    let content: string

    try {
      const stats = await fs.lstat(fileUrl)

      if (!stats.isFile()) {
        fileMismatches.push(file.path)
        continue
      }

      content = await fs.readFile(fileUrl, 'utf8')
    } catch (error) {
      if (isFileNotFoundError(error)) {
        fileMismatches.push(file.path)
        continue
      }
      throw error
    }

    const [digest] = computeSkillFileDigest([{ path: file.path, content }])

    if (digest?.contentHash !== file.contentHash) fileMismatches.push(file.path)
  }

  return { manifest, fileMismatches }
}

import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import matter from 'gray-matter'

import type { StarlightToSkillsConfig } from '../schemas/config'
import type { SkillDigest } from '../schemas/digest'
import { makeSkillManifest, SkillManifestSchema, type SkillManifest } from '../schemas/manifest'

import { computeSkillFileDigest, GeneratorVersion, normalizeLineEndings } from './digest'
import { getSkillManifestDirUrl, getSkillManifestUrl, isFileNotFoundError, pathExists, resolveDirectoryUrl } from './fs'
import type { SkillConfiguration } from './loader'

const skillDefinitionSuffix = '.skill.ts'
const skillManifestSuffix = '.json'

// TODO(HiDeoo)
export const SkillCheckIssueMessages = {
  'definition-change': 'Skill definition changed',
  'source-change': 'Documentation source changed',
  'model-change': 'Model changed',
  'generator-change': 'Generation version changed',
  'approved-skill-change': 'Approved skill changed',
} satisfies Record<SkillCheckIssue['type'], string>

export function getSkillNameByDefinitionUrl(url: URL): string {
  return path.basename(fileURLToPath(url), skillDefinitionSuffix)
}

export function getSkillNameByManifestUrl(url: URL): string {
  return path.basename(fileURLToPath(url), skillManifestSuffix)
}

export async function discoverSkillDefinitions(config: StarlightToSkillsConfig): Promise<URL[]> {
  const definitionUrls: URL[] = []

  for await (const entry of fs.glob(config.definitions, { cwd: fileURLToPath(config.rootDir), withFileTypes: true })) {
    if (!entry.isFile()) continue

    definitionUrls.push(pathToFileURL(path.join(entry.parentPath, entry.name)))
  }

  return definitionUrls.toSorted()
}

export function getSkillDefinitionUrlByName(definitionUrls: URL[], name: string): URL {
  const filename = `${name}${skillDefinitionSuffix}`

  const matchingUrls = definitionUrls.filter((url) => getSkillNameByDefinitionUrl(url) === name)
  const [matchingUrl] = matchingUrls

  if (!matchingUrl) throw new Error(`Failed to find skill definition '${filename}'.`)
  if (matchingUrls.length > 1) throw new Error(`Found multiple skill definitions named '${filename}'.`)

  return matchingUrl
}

export async function discoverSkillManifests(outputDir: URL): Promise<URL[]> {
  const manifestDirUrl = getSkillManifestDirUrl(outputDir)
  let entries: Dirent[]

  try {
    entries = await fs.readdir(manifestDirUrl, { withFileTypes: true })
  } catch (error) {
    if (isFileNotFoundError(error)) return []
    throw error
  }

  const manifestUrls: URL[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(skillManifestSuffix)) continue
    manifestUrls.push(new URL(entry.name, manifestDirUrl))
  }

  return manifestUrls.toSorted()
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

export async function pruneSkill(outputDir: URL, name: string) {
  await fs.rm(resolveDirectoryUrl(name, outputDir), { force: true, recursive: true })
  await fs.rm(getSkillManifestUrl(outputDir, name), { force: true })
}

export function checkSkill(
  manifest: SkillManifest,
  digest: SkillDigest,
  model: string,
  fileMismatches: string[],
): SkillCheckResult {
  const issues: SkillCheckIssue[] = []

  if (manifest.definitionHash !== digest.definitionHash) issues.push({ type: 'definition-change' })

  if (
    manifest.sources.some((source) =>
      digest.sources.some(
        (currentSource) =>
          currentSource.docsPath === source.docsPath && currentSource.contentHash !== source.contentHash,
      ),
    )
  ) {
    // TODO(HiDeoo) Maybe we should provide updated source paths
    issues.push({ type: 'source-change' })
  }

  if (manifest.model !== model) issues.push({ type: 'model-change' })
  if (manifest.generatorVersion !== GeneratorVersion) issues.push({ type: 'generator-change' })
  if (fileMismatches.length > 0) issues.push({ type: 'approved-skill-change', paths: fileMismatches })

  return issues.length === 0 ? { current: true } : { current: false, issues }
}

export async function approveSkill(config: StarlightToSkillsConfig, skill: SkillConfiguration, digest: SkillDigest) {
  const skillDirUrl = resolveDirectoryUrl(skill.name, config.outputDir)
  const manifestUrl = getSkillManifestUrl(config.outputDir, skill.name)

  if (!(await pathExists(skillDirUrl)) || !(await pathExists(manifestUrl))) {
    throw new Error(`Skill '${skill.name}' has not yet been approved.`)
  }

  const { manifest, fileMismatches } = await loadSkill(config.outputDir, skill.name)

  if (fileMismatches.length > 0) {
    // TODO(HiDeoo)
    throw new Error(`The skill '${skill.name}' has changed.`)
  }

  if (
    manifest.definitionHash !== digest.definitionHash &&
    !(await hasMatchingSkillDescription(config.outputDir, skill.name, skill.description))
  ) {
    throw new Error(
      `The description for skill '${skill.name}' has changed. Run 'starlight-to-skills generate ${skill.name}' first.`,
    )
  }

  await fs.writeFile(
    manifestUrl,
    JSON.stringify(makeSkillManifest(config, skill, digest, manifest.files), undefined, 2),
  )

  return skillDirUrl
}

export async function hasMatchingSkillDescription(outputDir: URL, name: string, expectedDescription: string) {
  const content = await fs.readFile(new URL('SKILL.md', resolveDirectoryUrl(name, outputDir)), 'utf8')

  try {
    const description: unknown = matter(content).data['description']
    return (
      typeof description === 'string' && normalizeLineEndings(description) === normalizeLineEndings(expectedDescription)
    )
  } catch {
    return false
  }
}

type SkillCheckIssue =
  | { type: 'definition-change' }
  | { type: 'source-change' }
  | { type: 'model-change' }
  | { type: 'generator-change' }
  | { type: 'approved-skill-change'; paths: string[] }

type SkillCheckResult = { current: true } | { current: false; issues: SkillCheckIssue[] }

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import matter from 'gray-matter'

import type { StarlightToSkillsConfig } from '../schemas/config'
import type { SkillDigest } from '../schemas/digest'
import { makeSkillManifest, SkillManifestSchema, type SkillManifest } from '../schemas/manifest'

import { computeSkillFileDigest, GeneratorVersion, normalizeLineEndings } from './digest'
import { getSkillManifestUrl, isFileNotFoundError, pathExists, resolveDirectoryUrl } from './fs'
import type { SkillConfiguration } from './loader'

export const SkillDefinitionSuffix = '.skill.ts'

// TODO(HiDeoo)
export const SkillCheckIssueMessages = {
  'definition-change': 'Skill definition changed',
  'source-change': 'Documentation source changed',
  'model-change': 'Model changed',
  'generator-change': 'Generation version changed',
  'approved-skill-change': 'Approved skill changed',
} satisfies Record<SkillCheckIssue['type'], string>

export async function discoverSkillDefinitions(config: StarlightToSkillsConfig): Promise<URL[]> {
  const definitionUrls: URL[] = []

  for await (const entry of fs.glob(config.definitions, { cwd: fileURLToPath(config.rootDir), withFileTypes: true })) {
    if (!entry.isFile()) continue

    definitionUrls.push(pathToFileURL(path.join(entry.parentPath, entry.name)))
  }

  return definitionUrls.toSorted()
}

export function getSkillNameFromDefinitionUrl(url: URL): string {
  return path.basename(fileURLToPath(url), SkillDefinitionSuffix)
}

export function getSkillDefinitionUrlByName(definitionUrls: URL[], name: string): URL {
  const filename = `${name}${SkillDefinitionSuffix}`

  const matchingUrls = definitionUrls.filter((url) => getSkillNameFromDefinitionUrl(url) === name)
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

export async function approveExistingSkill(
  config: StarlightToSkillsConfig,
  skill: SkillConfiguration,
  digest: SkillDigest,
) {
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

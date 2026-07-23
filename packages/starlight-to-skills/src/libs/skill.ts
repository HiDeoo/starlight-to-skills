import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import matter from 'gray-matter'

import type { StarlightToSkillsConfig } from '../schemas/config'
import type { SkillDigest } from '../schemas/digest'
import { makeSkillManifest, SkillManifestSchema, type SkillManifest } from '../schemas/manifest'
import { parseSkillName } from '../schemas/skill'

import { computeSkillFileDigest, GeneratorVersion, normalizeLineEndings } from './digest'
import { throwError } from './error'
import {
  getSkillManifestDirUrl,
  getSkillManifestUrl,
  isFileNotFoundError,
  pathExists,
  resolveDirectoryUrl,
  resolveRelativeFilePathUrl,
} from './fs'
import type { SkillConfiguration } from './loader'

const skillDefinitionSuffix = '.skill.ts'
const skillManifestSuffix = '.json'

export const SkillCheckIssueMessages = {
  'definition-change': 'Skill definition changed',
  'source-change': 'Documentation content changed',
  'model-change': 'Model changed',
  'generator-change': 'Generation version changed',
  'approved-skill-change': 'Approved skill changed',
} satisfies Record<SkillCheckIssue['type'], string>

export function getSkillNameByDefinitionUrl(url: URL): string {
  return getSkillNameByUrl(url, skillDefinitionSuffix)
}

export function getSkillNameByManifestUrl(url: URL): string {
  return getSkillNameByUrl(url, skillManifestSuffix)
}

export async function discoverSkillDefinitions(config: StarlightToSkillsConfig): Promise<URL[]> {
  const definitionUrls: URL[] = []

  try {
    for await (const entry of fs.glob(config.definitions, {
      cwd: fileURLToPath(config.rootDir),
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue

      definitionUrls.push(pathToFileURL(path.join(entry.parentPath, entry.name)))
    }
  } catch (error) {
    throwError('Failed to find skill definitions.', { cause: error })
  }

  return definitionUrls.toSorted()
}

export function getSkillDefinitionUrlByName(definitionUrls: URL[], name: string): URL {
  const skillName = parseSkillName(name)
  const filename = `${skillName}${skillDefinitionSuffix}`

  const matchingUrls = definitionUrls.filter((url) => getSkillNameByUrl(url, skillDefinitionSuffix) === skillName)
  const [matchingUrl] = matchingUrls

  if (!matchingUrl) {
    throwError(`No skill definition found for '${skillName}'.`, {
      hint: `Check the skill name or create '${filename}'.`,
    })
  } else if (matchingUrls.length > 1) {
    throwError(`Multiple skill definitions found for '${skillName}'.`, {
      hint: `Keep only one skill definition named '${filename}'.`,
    })
  }

  return matchingUrl
}

export async function discoverSkillManifests(outputDir: URL): Promise<URL[]> {
  const manifestDirUrl = getSkillManifestDirUrl(outputDir)
  let entries: Dirent[]

  try {
    entries = await fs.readdir(manifestDirUrl, { withFileTypes: true })
  } catch (error) {
    if (isFileNotFoundError(error)) return []
    throwError('Failed to find approved skills.', { cause: error })
  }

  const manifestUrls: URL[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(skillManifestSuffix)) continue
    manifestUrls.push(resolveRelativeFilePathUrl(entry.name, manifestDirUrl))
  }

  return manifestUrls.toSorted()
}

export async function loadSkillManifest(url: URL, name: string): Promise<SkillManifest> {
  let content: string

  try {
    content = await fs.readFile(url, 'utf8')
  } catch (error) {
    throwError(`Failed to load approved skill '${name}'.`, { cause: error })
  }

  try {
    const data: unknown = JSON.parse(content)
    const manifest = SkillManifestSchema.parse(data)
    if (manifest.name !== name) {
      throw new Error(`Expected approved skill name '${name}' but found '${manifest.name}'.`)
    }
    return manifest
  } catch (error) {
    throwError(`Failed to load approved skill '${name}'.`, { cause: error })
  }
}

export async function loadSkill(outputDir: URL, name: string) {
  const skillUrl = resolveDirectoryUrl(name, outputDir)
  const manifest = await loadSkillManifest(getSkillManifestUrl(outputDir, name), name)
  const fileMismatches: string[] = []

  for (const file of manifest.files) {
    const fileUrl = resolveRelativeFilePathUrl(file.path, skillUrl)
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
      throwError(`Failed to load approved skill '${name}'.`, { cause: error })
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

  const changedSourcePaths = manifest.sources
    .filter((source) =>
      digest.sources.some(
        (matchingSource) =>
          matchingSource.docsPath === source.docsPath && matchingSource.contentHash !== source.contentHash,
      ),
    )
    .map((source) => source.docsPath)

  if (changedSourcePaths.length > 0) {
    issues.push({ type: 'source-change', paths: changedSourcePaths })
  }

  if (manifest.model !== model) issues.push({ type: 'model-change' })
  if (manifest.generatorVersion !== GeneratorVersion) issues.push({ type: 'generator-change' })
  if (fileMismatches.length > 0) issues.push({ type: 'approved-skill-change', paths: fileMismatches })

  return issues.length === 0 ? { upToDate: true } : { upToDate: false, issues }
}

export async function approveSkill(config: StarlightToSkillsConfig, skill: SkillConfiguration, digest: SkillDigest) {
  const skillDirUrl = resolveDirectoryUrl(skill.name, config.outputDir)
  const manifestUrl = getSkillManifestUrl(config.outputDir, skill.name)

  let hasSkill: boolean
  let hasManifest: boolean

  try {
    hasSkill = await pathExists(skillDirUrl)
    hasManifest = await pathExists(manifestUrl)
  } catch (error) {
    throwError(`Failed to approve '${skill.name}'.`, { cause: error })
  }

  if (!hasSkill || !hasManifest) {
    throwError(`No approved skill found for '${skill.name}'.`, {
      hint: `If needed, run 'starlight-to-skills generate ${skill.name}', then run 'starlight-to-skills approve ${skill.name}' without '--existing'.`,
    })
  }

  const { manifest, fileMismatches } = await loadSkill(config.outputDir, skill.name)

  if (fileMismatches.length > 0) {
    throwError(
      `The following files in approved skill '${skill.name}' have changed:\n\n${fileMismatches
        .map((path) => ` - ${path}`)
        .join('\n')}`,
      {
        hint: `Restore the listed files. To keep intended changes, update the skill definition or documentation, run 'starlight-to-skills generate ${skill.name}', review the generated skill, and then run 'starlight-to-skills approve ${skill.name}'.`,
      },
    )
  }

  if (
    manifest.definitionHash !== digest.definitionHash &&
    !(await hasMatchingSkillDescription(config.outputDir, skill.name, skill.description))
  ) {
    throwError(`Description for '${skill.name}' has changed.`, {
      hint: `Run 'starlight-to-skills generate ${skill.name}'.`,
    })
  }

  try {
    await fs.writeFile(
      manifestUrl,
      JSON.stringify(makeSkillManifest(config, skill, digest, manifest.files), undefined, 2),
    )
  } catch (error) {
    throwError(`Failed to approve '${skill.name}'.`, { cause: error })
  }
}

export async function hasMatchingSkillDescription(outputDir: URL, name: string, expectedDescription: string) {
  let content: string

  try {
    content = await fs.readFile(new URL('SKILL.md', resolveDirectoryUrl(name, outputDir)), 'utf8')
  } catch (error) {
    throwError(`Failed to load approved skill '${name}'.`, { cause: error })
  }

  try {
    const description: unknown = matter(content).data['description']
    return (
      typeof description === 'string' && normalizeLineEndings(description) === normalizeLineEndings(expectedDescription)
    )
  } catch {
    return false
  }
}

function getSkillNameByUrl(url: URL, suffix: string): string {
  return path.basename(fileURLToPath(url), suffix)
}

type SkillCheckIssue =
  | { type: 'definition-change' }
  | { type: 'source-change'; paths: string[] }
  | { type: 'model-change' }
  | { type: 'generator-change' }
  | { type: 'approved-skill-change'; paths: string[] }

type SkillCheckResult = { upToDate: true } | { upToDate: false; issues: SkillCheckIssue[] }

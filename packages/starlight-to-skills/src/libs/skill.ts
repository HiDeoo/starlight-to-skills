import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

import matter from 'gray-matter'

import type { StarlightToSkillsConfig } from '../schemas/config'
import type { SkillDigest } from '../schemas/digest'
import { makeSkillManifest, SkillManifestSchema, type SkillManifest } from '../schemas/manifest'
import { parseSkillName } from '../schemas/skill'

import type { SkillFile } from './content'
import { computeSkillFileDigest } from './digest'
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
import { style } from './terminal'

const skillDefinitionSuffix = '.skill.ts'
const skillManifestSuffix = '.json'

export function getSkillNameByDefinitionUrl(url: URL): string {
  return getSkillNameByUrl(url, skillDefinitionSuffix)
}

export function getSkillNameByManifestUrl(url: URL): string {
  return getSkillNameByUrl(url, skillManifestSuffix)
}

export async function discoverSkillDefinitions(
  config: Pick<StarlightToSkillsConfig, 'definitionsDir'>,
): Promise<URL[]> {
  const definitionUrls: URL[] = []

  try {
    for await (const entry of fs.glob(`*${skillDefinitionSuffix}`, {
      cwd: fileURLToPath(config.definitionsDir),
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue

      definitionUrls.push(pathToFileURL(path.join(entry.parentPath, entry.name)))
    }
  } catch (error) {
    if (isFileNotFoundError(error)) return []
    throwError('Failed to find skill definitions.', { cause: error })
  }

  return definitionUrls.toSorted()
}

export function getSkillDefinitionUrlByName(definitionUrls: URL[], name: string): URL {
  const skillName = parseSkillName(name)
  const filename = `${skillName}${skillDefinitionSuffix}`

  const matchingUrl = definitionUrls.find((url) => getSkillNameByUrl(url, skillDefinitionSuffix) === skillName)

  if (!matchingUrl) {
    throwError(`No skill definition found for ${style.skillName(skillName)}.`, {
      hint: `Check the skill name or create '${filename}'.`,
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
    throwError(`Failed to load approved skill ${style.skillName(name)}.`, { cause: error })
  }

  try {
    const data: unknown = JSON.parse(content)
    const manifest = SkillManifestSchema.parse(data)
    if (manifest.name !== name) {
      throw new Error(
        `Expected approved skill name ${style.skillName(name)} but found ${style.skillName(manifest.name)}.`,
      )
    }
    return manifest
  } catch (error) {
    throwError(`Failed to load approved skill ${style.skillName(name)}.`, { cause: error })
  }
}

export async function loadSkill(outputDir: URL, name: string): Promise<LoadedSkill> {
  const skillUrl = resolveDirectoryUrl(name, outputDir)
  const manifest = await loadSkillManifest(getSkillManifestUrl(outputDir, name), name)
  const files: SkillFile[] = []
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
      throwError(`Failed to load approved skill ${style.skillName(name)}.`, { cause: error })
    }

    files.push({ path: file.path, content })

    const [digest] = computeSkillFileDigest([{ path: file.path, content }])

    if (digest?.contentHash !== file.contentHash) fileMismatches.push(file.path)
  }

  return { manifest, files, fileMismatches }
}

export async function pruneSkill(outputDir: URL, name: string) {
  await fs.rm(resolveDirectoryUrl(name, outputDir), { force: true, recursive: true })
  await fs.rm(getSkillManifestUrl(outputDir, name), { force: true })
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
    throwError(`Failed to approve ${style.skillName(skill.name)}.`, { cause: error })
  }

  if (!hasSkill || !hasManifest) {
    throwError(`No approved skill found for ${style.skillName(skill.name)}.`, {
      hint: `If needed, run ${style.command(`starlight-to-skills generate ${skill.name}`)}, then run ${style.command(`starlight-to-skills approve ${skill.name}`)} without '--existing'.`,
    })
  }

  const { manifest, fileMismatches } = await loadSkill(config.outputDir, skill.name)

  if (fileMismatches.length > 0) {
    const changedFiles = fileMismatches.map((path) => ` - ${path}`).join('\n')

    throwError(
      `The following files in approved skill ${style.skillName(skill.name)} have changed:\n\n${changedFiles}`,
      {
        hint: `Restore the listed files. To keep intended changes, update the skill definition or documentation, run ${style.command(`starlight-to-skills generate ${skill.name}`)}, review the generated skill, and then run ${style.command(`starlight-to-skills approve ${skill.name}`)}.`,
      },
    )
  }

  if (
    manifest.definitionHash !== digest.definitionHash &&
    !(await hasMatchingSkillFrontmatter(config.outputDir, skill))
  ) {
    throwError(`Description, license, compatibility, or metadata for ${style.skillName(skill.name)} has changed.`, {
      hint: `Run ${style.command(`starlight-to-skills generate ${skill.name}`)}.`,
    })
  }

  try {
    await fs.writeFile(
      manifestUrl,
      JSON.stringify(makeSkillManifest(config, skill, digest, manifest.files), undefined, 2),
    )
  } catch (error) {
    throwError(`Failed to approve ${style.skillName(skill.name)}.`, { cause: error })
  }
}

export async function hasMatchingSkillFrontmatter(
  outputDir: URL,
  skill: Pick<SkillConfiguration, 'name' | 'description' | 'license' | 'compatibility' | 'metadata'>,
) {
  let content: string

  try {
    content = await fs.readFile(new URL('SKILL.md', resolveDirectoryUrl(skill.name, outputDir)), 'utf8')
  } catch (error) {
    throwError(`Failed to load approved skill ${style.skillName(skill.name)}.`, { cause: error })
  }

  try {
    const frontmatter = matter(content).data
    return (
      frontmatter['description'] === skill.description &&
      frontmatter['license'] === skill.license &&
      frontmatter['compatibility'] === skill.compatibility &&
      isDeepStrictEqual(frontmatter['metadata'], skill.metadata)
    )
  } catch {
    return false
  }
}

function getSkillNameByUrl(url: URL, suffix: string): string {
  return path.basename(fileURLToPath(url), suffix)
}

export interface LoadedSkill {
  manifest: SkillManifest
  files: SkillFile[]
  fileMismatches: string[]
}

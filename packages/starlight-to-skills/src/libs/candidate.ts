import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

import { validateCandidateFiles } from '../schemas/candidate'
import type { StarlightToSkillsConfig } from '../schemas/config'
import type { SkillDigest } from '../schemas/digest'
import { CandidateManifestSchema, makeSkillManifest } from '../schemas/manifest'

import type { SkillFile } from './content'
import { computeSkillFileDigest, type SkillFileDigest } from './digest'
import { StarlightToSkillsError, throwError } from './error'
import {
  ensureDirectory,
  getSkillManifestUrl,
  isFileNotFoundError,
  pathExists,
  resolveDirectoryUrl,
  resolveRelativeFilePathUrl,
} from './fs'
import type { SkillConfiguration } from './loader'
import { loadSkillManifest } from './skill'
import { formatSkillName } from './style'

export function createCandidate(inputHash: string, files: SkillFile[]): Candidate {
  validateCandidateFiles(files)

  return { inputHash, files, fileDigests: computeSkillFileDigest(files) }
}

export async function writeCandidate(dataDir: URL, name: string, candidate: Candidate) {
  validateCandidateFiles(candidate.files)

  const candidateUrl = getCandidateDirUrl(dataDir, name)

  try {
    await fs.rm(candidateUrl, { force: true, recursive: true })

    for (const file of candidate.files) {
      const fileUrl = resolveRelativeFilePathUrl(file.path, candidateUrl)

      await fs.mkdir(new URL('.', fileUrl), { recursive: true })
      await fs.writeFile(fileUrl, file.content)
    }

    const manifest = { inputHash: candidate.inputHash, files: candidate.fileDigests }

    await fs.writeFile(new URL('manifest.json', candidateUrl), JSON.stringify(manifest, undefined, 2))
  } catch (error) {
    throwError(`Failed to save generated skill ${formatSkillName(name)}.`, { cause: error })
  }
}

export async function loadCandidate(dataDir: URL, name: string, expectedInputHash: string): Promise<Candidate> {
  const candidateUrl = getCandidateDirUrl(dataDir, name)

  let manifestData: unknown

  try {
    manifestData = JSON.parse(await fs.readFile(new URL('manifest.json', candidateUrl), 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) throwInvalidCandidateError(name)
    if (isFileNotFoundError(error)) {
      throwError(`No generated skill found for ${formatSkillName(name)}.`, {
        hint: `Run 'starlight-to-skills generate ${name}'.`,
      })
    }
    throwError(`Failed to load generated skill ${formatSkillName(name)}.`, { cause: error })
  }

  const result = CandidateManifestSchema.safeParse(manifestData)
  if (!result.success) throwInvalidCandidateError(name)

  const manifest = result.data

  if (manifest.inputHash !== expectedInputHash) {
    throwError(`Generated skill for ${formatSkillName(name)} is out of date.`, {
      hint: `Run 'starlight-to-skills generate ${name}' again.`,
    })
  }

  const files: SkillFile[] = []

  for (const file of manifest.files) {
    try {
      files.push({
        path: file.path,
        content: await fs.readFile(resolveRelativeFilePathUrl(file.path, candidateUrl), 'utf8'),
      })
    } catch (error) {
      if (isFileNotFoundError(error)) throwInvalidCandidateError(name)
      throwError(`Failed to load generated skill ${formatSkillName(name)}.`, { cause: error })
    }
  }

  validateCandidateFiles(files)

  const fileDigests = computeSkillFileDigest(files)

  if (fileDigests.some((file, index) => file.contentHash !== manifest.files[index]?.contentHash)) {
    throwInvalidCandidateError(name)
  }

  return { inputHash: manifest.inputHash, files, fileDigests }
}

export async function removeCandidateForInput(dataDir: URL, name: string, inputHash: string) {
  const candidateUrl = getCandidateDirUrl(dataDir, name)

  let content: string

  try {
    content = await fs.readFile(new URL('manifest.json', candidateUrl), 'utf8')
  } catch (error) {
    if (isFileNotFoundError(error)) return
    throw error
  }

  let data: unknown

  try {
    data = JSON.parse(content)
  } catch {
    data = undefined
  }

  const result = CandidateManifestSchema.safeParse(data)

  if (!result.success || result.data.inputHash === inputHash) {
    await fs.rm(candidateUrl, { force: true, recursive: true })
  }
}

export async function approveCandidate(
  config: StarlightToSkillsConfig,
  skill: SkillConfiguration,
  digest: SkillDigest,
  candidate: Candidate,
): Promise<'approved' | 'already-approved'> {
  validateCandidateFiles(candidate.files)

  const skillPath = fileURLToPath(resolveRelativeFilePathUrl(skill.name, config.outputDir))
  const manifestUrl = getSkillManifestUrl(config.outputDir, skill.name)

  let hasSkill: boolean
  let hasManifest: boolean

  try {
    await ensureDirectory(new URL('.', manifestUrl))

    hasSkill = await pathExists(skillPath)
    hasManifest = await pathExists(manifestUrl)
  } catch (error) {
    if (error instanceof StarlightToSkillsError) throw error
    throwError(`Failed to approve ${formatSkillName(skill.name)}.`, { cause: error })
  }

  if (hasSkill && !hasManifest) {
    throwError(
      `Cannot approve ${formatSkillName(skill.name)} because a file or directory already exists at '${skillPath}'.`,
      {
        hint: 'Move the existing file or directory and try again.',
      },
    )
  }

  const manifest = makeSkillManifest(config, skill, digest, candidate.fileDigests)

  if (hasManifest) {
    const approvedManifest = await loadSkillManifest(manifestUrl, skill.name)

    if (isDeepStrictEqual(approvedManifest, manifest) && (await hasMatchingApprovedSkillFiles(skillPath, candidate))) {
      return 'already-approved'
    }
  }

  try {
    await fs.rm(skillPath, { force: true, recursive: true })

    for (const file of candidate.files) {
      const filePath = path.join(skillPath, file.path)

      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, file.content)
    }

    await fs.writeFile(manifestUrl, JSON.stringify(manifest, undefined, 2))
  } catch (error) {
    throwError(`Failed to approve ${formatSkillName(skill.name)}.`, { cause: error })
  }

  return 'approved'
}

async function hasMatchingApprovedSkillFiles(skillPath: string, candidate: Candidate): Promise<boolean> {
  try {
    const stats = await fs.lstat(skillPath)
    if (!stats.isDirectory()) return false

    const expectedPaths = new Set(candidate.files.map((file) => path.join(skillPath, file.path)))
    const paths = new Set<string>()
    const entries = await fs.readdir(skillPath, { recursive: true, withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory()) continue
      if (!entry.isFile()) return false

      const filePath = path.join(entry.parentPath, entry.name)

      if (!expectedPaths.has(filePath)) return false

      paths.add(filePath)
    }

    if (paths.size !== expectedPaths.size) return false

    const files = await Promise.all(
      candidate.files.map(async (file) => ({
        path: file.path,
        content: await fs.readFile(path.join(skillPath, file.path), 'utf8'),
      })),
    )

    return isDeepStrictEqual(computeSkillFileDigest(files), candidate.fileDigests)
  } catch {
    return false
  }
}

function getCandidateDirUrl(dataDir: URL, name: string): URL {
  return resolveDirectoryUrl(name, dataDir)
}

function throwInvalidCandidateError(name: string): never {
  throwError(`Generated skill for ${formatSkillName(name)} is invalid.`, {
    hint: `Run 'starlight-to-skills generate ${name}' again.`,
  })
}

export interface Candidate {
  inputHash: string
  files: SkillFile[]
  fileDigests: SkillFileDigest[]
}

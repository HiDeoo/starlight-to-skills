import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

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

// TODO(HiDeoo) skill names in error should always be primary?

export function createCandidate(inputHash: string, files: SkillFile[]): Candidate {
  validateCandidateFiles(files)

  return { inputHash, files, fileDigests: computeSkillFileDigest(files) }
}

export async function writeCandidate(dataDir: URL, name: string, candidate: Candidate) {
  validateCandidateFiles(candidate.files)

  const candidateUrl = getCandidateDirUrl(dataDir, name)

  await fs.rm(candidateUrl, { force: true, recursive: true })

  for (const file of candidate.files) {
    const fileUrl = resolveRelativeFilePathUrl(file.path, candidateUrl)

    await fs.mkdir(new URL('.', fileUrl), { recursive: true })
    await fs.writeFile(fileUrl, file.content)
  }

  const manifest = { inputHash: candidate.inputHash, files: candidate.fileDigests }

  await fs.writeFile(new URL('manifest.json', candidateUrl), JSON.stringify(manifest, undefined, 2))

  return candidateUrl
}

export async function loadCandidate(dataDir: URL, name: string, expectedInputHash: string): Promise<Candidate> {
  const candidateUrl = getCandidateDirUrl(dataDir, name)

  let manifestData: unknown

  try {
    manifestData = JSON.parse(await fs.readFile(new URL('manifest.json', candidateUrl), 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) throwInvalidCandidateError(name)
    if (isFileNotFoundError(error)) {
      throwError(`No generated skill found for '${name}'.`, { hint: `Run 'starlight-to-skills generate ${name}'.` })
    }
    throwError(`Failed to load generated skill '${name}'.`, { cause: error })
  }

  const result = CandidateManifestSchema.safeParse(manifestData)
  if (!result.success) throwInvalidCandidateError(name)

  const manifest = result.data

  if (manifest.inputHash !== expectedInputHash) {
    throwError(`Generated skill for '${name}' is out of date.`, {
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
      throwError(`Failed to load generated skill '${name}'.`, { cause: error })
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
) {
  validateCandidateFiles(candidate.files)

  const skillDirUrl = resolveDirectoryUrl(skill.name, config.outputDir)
  const manifestUrl = getSkillManifestUrl(config.outputDir, skill.name)

  let isAlreadyApproved: boolean
  let hasManifest: boolean

  try {
    await ensureDirectory(new URL('.', manifestUrl))

    isAlreadyApproved = await pathExists(skillDirUrl)
    hasManifest = await pathExists(manifestUrl)
  } catch (error) {
    if (error instanceof StarlightToSkillsError) throw error
    throwError(`Failed to approve '${skill.name}'.`, { cause: error })
  }

  if (isAlreadyApproved && !hasManifest) {
    throwError(
      `Cannot approve '${skill.name}' because a file or directory already exists at '${fileURLToPath(skillDirUrl)}'.`,
      { hint: 'Move the existing file or directory and try again.' },
    )
  }

  if (hasManifest) {
    await loadSkillManifest(manifestUrl, skill.name)
  }

  const manifest = makeSkillManifest(config, skill, digest, candidate.fileDigests)

  try {
    await fs.rm(skillDirUrl, { force: true, recursive: true })

    for (const file of candidate.files) {
      const fileUrl = resolveRelativeFilePathUrl(file.path, skillDirUrl)

      await fs.mkdir(new URL('.', fileUrl), { recursive: true })
      await fs.writeFile(fileUrl, file.content)
    }

    await fs.writeFile(manifestUrl, JSON.stringify(manifest, undefined, 2))
  } catch (error) {
    throwError(`Failed to approve '${skill.name}'.`, { cause: error })
  }
}

function getCandidateDirUrl(dataDir: URL, name: string): URL {
  return resolveDirectoryUrl(name, dataDir)
}

function throwInvalidCandidateError(name: string): never {
  throwError(`Generated skill for '${name}' is invalid.`, { hint: `Run 'starlight-to-skills generate ${name}' again.` })
}

export interface Candidate {
  inputHash: string
  files: SkillFile[]
  fileDigests: SkillFileDigest[]
}

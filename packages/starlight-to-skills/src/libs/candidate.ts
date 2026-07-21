import fs from 'node:fs/promises'

import { validateCandidateFilePaths } from '../schemas/candidate'
import type { StarlightToSkillsConfig } from '../schemas/config'
import type { SkillDigest } from '../schemas/digest'
import { CandidateManifestSchema, makeSkillManifest } from '../schemas/manifest'

import type { SkillFile } from './content'
import { computeSkillFileDigest, type SkillFileDigest } from './digest'
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

export function createCandidate(inputHash: string, files: SkillFile[]): Candidate {
  // TODO(HiDeoo) validation
  validateCandidateFilePaths(files)

  return { inputHash, files, fileDigests: computeSkillFileDigest(files) }
}

export async function writeCandidate(dataDir: URL, name: string, candidate: Candidate) {
  validateCandidateFilePaths(candidate.files)

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
      throw new Error(`No candidate found for skill '${name}'. Run 'starlight-to-skills generate ${name}' first.`)
    }
    throw error
  }

  const result = CandidateManifestSchema.safeParse(manifestData)
  if (!result.success) throwInvalidCandidateError(name)

  const manifest = result.data

  if (manifest.inputHash !== expectedInputHash) {
    throw new Error(`Candidate for skill '${name}' is outdated. Run 'starlight-to-skills generate ${name}' again.`)
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
      throw error
    }
  }

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
  validateCandidateFilePaths(candidate.files)

  const skillDirUrl = resolveDirectoryUrl(skill.name, config.outputDir)
  const manifestUrl = getSkillManifestUrl(config.outputDir, skill.name)

  await ensureDirectory(new URL('.', manifestUrl))

  const isAlreadyApproved = await pathExists(skillDirUrl)
  const hasManifest = await pathExists(manifestUrl)

  if (isAlreadyApproved && !hasManifest) {
    throw new Error(`The existing '${skill.name}' skill is not managed by Starlight to Skills.`)
  }

  if (hasManifest) {
    await loadSkillManifest(manifestUrl, skill.name)
  }

  const manifest = makeSkillManifest(config, skill, digest, candidate.fileDigests)

  await fs.rm(skillDirUrl, { force: true, recursive: true })

  for (const file of candidate.files) {
    const fileUrl = resolveRelativeFilePathUrl(file.path, skillDirUrl)

    await fs.mkdir(new URL('.', fileUrl), { recursive: true })
    await fs.writeFile(fileUrl, file.content)
  }

  await fs.writeFile(manifestUrl, JSON.stringify(manifest, undefined, 2))

  return skillDirUrl
}

function getCandidateDirUrl(dataDir: URL, name: string): URL {
  return resolveDirectoryUrl(name, dataDir)
}

function throwInvalidCandidateError(name: string): never {
  throw new Error(`Candidate for skill '${name}' is invalid. Run 'starlight-to-skills generate ${name}' again.`)
}

export interface Candidate {
  inputHash: string
  files: SkillFile[]
  fileDigests: SkillFileDigest[]
}

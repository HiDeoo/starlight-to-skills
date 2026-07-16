import fs from 'node:fs/promises'

import { CandidateManifestSchema } from '../schemas/candidate'

import type { SkillFile } from './content'
import { computeSkillFileDigest, type SkillFileDigest } from './digest'
import { ensureTrailingSlash } from './path'

export function createCandidate(inputHash: string, files: SkillFile[]): Candidate {
  // TODO(HiDeoo) validation
  // TODO(HiDeoo) validate paths
  return { inputHash, files, fileDigests: computeSkillFileDigest(files) }
}

export async function writeCandidate(dataDir: URL, name: string, candidate: Candidate) {
  const candidateUrl = getCandidateUrl(dataDir, name)

  await fs.rm(candidateUrl, { force: true, recursive: true })

  for (const file of candidate.files) {
    const fileUrl = new URL(file.path, candidateUrl)

    await fs.mkdir(new URL('.', fileUrl), { recursive: true })
    await fs.writeFile(fileUrl, file.content)
  }

  const manifest = { inputHash: candidate.inputHash, files: candidate.fileDigests }

  await fs.writeFile(new URL('manifest.json', candidateUrl), JSON.stringify(manifest, undefined, 2))

  return candidateUrl
}

export async function removeCandidateForInput(dataDir: URL, name: string, inputHash: string) {
  const candidateUrl = getCandidateUrl(dataDir, name)

  let content: string

  try {
    content = await fs.readFile(new URL('manifest.json', candidateUrl), 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
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

function getCandidateUrl(dataDir: URL, name: string): URL {
  return new URL(ensureTrailingSlash(name), dataDir)
}

export interface Candidate {
  inputHash: string
  files: SkillFile[]
  fileDigests: SkillFileDigest[]
}

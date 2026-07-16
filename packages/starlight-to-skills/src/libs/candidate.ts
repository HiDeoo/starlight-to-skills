import fs from 'node:fs/promises'

import type { SkillFile } from './content'
import { computeSkillFileDigest, type SkillFileDigest } from './digest'
import { ensureTrailingSlash } from './path'

export function createCandidate(inputHash: string, files: SkillFile[]): Candidate {
  // TODO(HiDeoo) validation
  // TODO(HiDeoo) validate paths
  return { inputHash, files, fileDigests: computeSkillFileDigest(files) }
}

export async function writeCandidate(dataDir: URL, name: string, candidate: Candidate) {
  const candidateUrl = new URL(ensureTrailingSlash(name), dataDir)

  await fs.rm(candidateUrl, { force: true, recursive: true })

  for (const file of candidate.files) {
    const fileUrl = new URL(file.path, candidateUrl)

    await fs.mkdir(new URL('.', fileUrl), { recursive: true })
    await fs.writeFile(fileUrl, file.content)
  }

  const manifest = { inputHash: candidate.inputHash, files: candidate.fileDigests }

  await fs.writeFile(new URL('manifest.json', candidateUrl), JSON.stringify(manifest, undefined, 2))
}

export interface Candidate {
  inputHash: string
  files: SkillFile[]
  fileDigests: SkillFileDigest[]
}

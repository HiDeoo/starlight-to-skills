import type { SkillFile } from './content'
import { computeSkillFileDigest, type SkillFileDigest } from './digest'

export function createCandidate(inputHash: string, files: SkillFile[]): Candidate {
  return { inputHash, files, fileDigests: computeSkillFileDigest(files) }
}

export interface Candidate {
  inputHash: string
  files: SkillFile[]
  fileDigests: SkillFileDigest[]
}

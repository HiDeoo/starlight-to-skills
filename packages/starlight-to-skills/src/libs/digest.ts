import { createHash } from 'node:crypto'

import type { SkillDigest } from '../schemas/digest'

import type { SkillFile } from './content'
import type { SkillConfiguration } from './loader'
import type { SkillDocumentation } from './starlight'

export const DigestVersion = 1

const NonLfLineEndingRegex = /\r\n?/g

export function computeSkillDigest(model: string, skill: SkillConfiguration, docs: SkillDocumentation[]): SkillDigest {
  const definition = {
    description: normalizeLineEndings(skill.description),
    docs: skill.docs.map(normalizeLineEndings),
    guidance: skill.guidance === undefined ? undefined : normalizeLineEndings(skill.guidance),
  }

  const sources = docs.map((doc, index) => ({
    docsPath: normalizeLineEndings(skill.docs[index] as string),
    title: normalizeLineEndings(doc.title),
    body: normalizeLineEndings(doc.body),
  }))

  return {
    inputHash: hash({
      name: normalizeLineEndings(skill.name),
      definition,
      sources,
      model: normalizeLineEndings(model),
      digestVersion: DigestVersion,
    }),
    definitionHash: hash(definition),
    sources: sources.map(({ docsPath, title, body }) => ({ docsPath, contentHash: hash({ title, body }) })),
  }
}

export function computeSkillFileDigest(files: SkillFile[]): SkillFileDigest[] {
  return files.map(({ path, content }) => ({ path, contentHash: hashString(normalizeLineEndings(content)) }))
}

function hash(value: unknown): string {
  return hashString(JSON.stringify(value))
}

function hashString(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll(NonLfLineEndingRegex, '\n')
}

export interface SkillFileDigest {
  path: string
  contentHash: string
}

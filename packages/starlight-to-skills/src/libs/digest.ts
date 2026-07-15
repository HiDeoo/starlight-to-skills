import { createHash } from 'node:crypto'

import type { SkillConfiguration } from './loader'
import type { SkillDocumentation } from './starlight'

export const digestVersion = 1

const NonLfLineEndingRegex = /\r\n?/g

export interface SkillDigest {
  hash: string
  definitionHash: string
  sources: { docsPath: string; contentHash: string }[]
}

export function computeSkillDigest({
  model,
  skill,
  docs,
}: {
  model: string
  skill: SkillConfiguration
  docs: SkillDocumentation[]
}): SkillDigest {
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
    hash: hash({
      name: normalizeLineEndings(skill.name),
      definition,
      sources,
      model: normalizeLineEndings(model),
      digestVersion,
    }),
    definitionHash: hash(definition),
    sources: sources.map(({ docsPath, title, body }) => ({ docsPath, contentHash: hash({ title, body }) })),
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll(NonLfLineEndingRegex, '\n')
}

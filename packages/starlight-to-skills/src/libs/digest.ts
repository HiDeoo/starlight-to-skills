import { createHash } from 'node:crypto'

import type { SkillDigest } from '../schemas/digest'

import type { SkillFile } from './content'
import type { SkillConfiguration } from './loader'
import type { SkillDocumentation } from './starlight'

// Bump after any change that could affect the generated skill files or their validation, e.g. updating the prompt.
export const GeneratorVersion = 1

const NonLfLineEndingRegex = /\r\n?/g

export function computeSkillDigest(model: string, skill: SkillConfiguration, docs: SkillDocumentation[]): SkillDigest {
  const definition = {
    description: skill.description,
    docs: skill.docs,
    guidance: skill.guidance === undefined ? undefined : normalizeLineEndings(skill.guidance),
    license: skill.license,
    compatibility: skill.compatibility,
  }

  const normalizedDocs = docs.map((doc) => ({
    path: doc.path,
    title: normalizeLineEndings(doc.title),
    body: normalizeLineEndings(doc.body),
  }))

  return {
    inputHash: hash({
      name: skill.name,
      definition,
      docs: normalizedDocs,
      model,
      generatorVersion: GeneratorVersion,
    }),
    definitionHash: hash(definition),
    docs: normalizedDocs.map(({ path, title, body }) => ({ path, contentHash: hash({ title, body }) })),
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

export function normalizeLineEndings(value: string): string {
  return value.replaceAll(NonLfLineEndingRegex, '\n')
}

export interface SkillFileDigest {
  path: string
  contentHash: string
}

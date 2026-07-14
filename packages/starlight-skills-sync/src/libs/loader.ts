import path from 'node:path'

import { createJiti } from 'jiti'

import { skillDefinitionSchema, type SkillDefinition } from '../schemas/skill'

const skillDefinitionSuffix = '.skill.ts'

const jiti = createJiti(import.meta.url)

// TODO(HiDeoo) make sure to surface proper error in CLI
export async function loadSkillDefinition(definitionPath: string): Promise<SkillConfiguration> {
  const resolvedDefinitionPath = path.resolve(definitionPath)
  const filename = path.basename(resolvedDefinitionPath)
  const name = filename.slice(0, -skillDefinitionSuffix.length)

  // TODO(HiDeoo) validate name
  // TODO(HiDeoo) slugify?

  let definitionModule: unknown

  try {
    definitionModule = await jiti.import(resolvedDefinitionPath, { default: true })
  } catch (error) {
    // TODO(HiDeoo)
    throw new Error(`Failed to load skill definition '${filename}'.`, { cause: error })
  }

  let definition: SkillDefinition

  try {
    definition = skillDefinitionSchema.parse(definitionModule)
  } catch (error) {
    // TODO(HiDeoo)
    throw new Error(`Invalid skill definition '${filename}'.`, { cause: error })
  }

  return { name, path: resolvedDefinitionPath, ...definition }
}

interface SkillConfiguration extends SkillDefinition {
  name: string
  path: string
}

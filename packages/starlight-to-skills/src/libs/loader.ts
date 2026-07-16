import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

import { ConfigSchema, type StarlightToSkillsConfig } from '../schemas/config'
import { SkillDefinitionSchema, type SkillDefinition } from '../schemas/skill'

import { ensureTrailingSlash } from './path'
import { SkillDefinitionSuffix } from './skill'

const configFilename = 'starlight-to-skills.config.ts'

const jiti = createJiti(import.meta.url)

// TODO(HiDeoo) make sure to surface proper error in CLI
export async function loadConfig(rootDir: URL): Promise<StarlightToSkillsConfig> {
  const url = new URL(configFilename, rootDir)

  let configModule: unknown

  try {
    configModule = await jiti.import(fileURLToPath(url), { default: true })
  } catch (error) {
    // TODO(HiDeoo)
    throw new Error(`Failed to load Starlight to Skills configuration '${configFilename}'.`, {
      cause: error,
    })
  }

  let config: ReturnType<typeof ConfigSchema.parse>

  try {
    config = ConfigSchema.parse(configModule)
  } catch (error) {
    // TODO(HiDeoo)
    throw new Error(`Invalid Starlight to Skills configuration '${configFilename}'.`, { cause: error })
  }

  return {
    ...config,
    url,
    rootDir,
    // TODO(HiDeoo) Move to variable or something
    dataDir: new URL('.starlight-to-skills/', rootDir),
    outputDir: new URL(ensureTrailingSlash(config.outputDir), rootDir),
  }
}

// TODO(HiDeoo) make sure to surface proper error in CLI
export async function loadSkill(url: URL): Promise<SkillConfiguration> {
  const definitionPath = fileURLToPath(url)
  const filename = path.basename(definitionPath)
  const name = filename.slice(0, -SkillDefinitionSuffix.length)

  // TODO(HiDeoo) validate name
  // TODO(HiDeoo) slugify?

  let definitionModule: unknown

  try {
    definitionModule = await jiti.import(definitionPath, { default: true })
  } catch (error) {
    // TODO(HiDeoo)
    throw new Error(`Failed to load skill definition '${filename}'.`, { cause: error })
  }

  let definition: SkillDefinition

  try {
    definition = SkillDefinitionSchema.parse(definitionModule)
  } catch (error) {
    // TODO(HiDeoo)
    throw new Error(`Invalid skill definition '${filename}'.`, { cause: error })
  }

  return { name, url, ...definition }
}

export interface SkillConfiguration extends SkillDefinition {
  name: string
  url: URL
}

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

import { configSchema, type StarlightSkillsSyncConfig } from '../schemas/config'
import { skillDefinitionSchema, type SkillDefinition } from '../schemas/skill'

import { ensureTrailingSlash } from './path'

const configFilename = 'starlight-skills-sync.config.ts'
const skillDefinitionSuffix = '.skill.ts'

const jiti = createJiti(import.meta.url)

// TODO(HiDeoo) make sure to surface proper error in CLI
export async function loadConfig(rootDir: URL): Promise<StarlightSkillsSyncConfig> {
  const url = new URL(configFilename, rootDir)

  let configModule: unknown

  try {
    configModule = await jiti.import(fileURLToPath(url), { default: true })
  } catch (error) {
    // TODO(HiDeoo)
    throw new Error(`Failed to load Starlight Skills Sync configuration '${configFilename}'.`, {
      cause: error,
    })
  }

  let config: ReturnType<typeof configSchema.parse>

  try {
    config = configSchema.parse(configModule)
  } catch (error) {
    // TODO(HiDeoo)
    throw new Error(`Invalid Starlight Skills Sync config '${configFilename}'.`, { cause: error })
  }

  return {
    ...config,
    url,
    rootDir,
    outputDir: new URL(ensureTrailingSlash(config.outputDir), rootDir),
    syncDir: new URL('.starlight-skills-sync/', rootDir),
  }
}

// TODO(HiDeoo) make sure to surface proper error in CLI
export async function loadSkill(url: URL): Promise<SkillConfiguration> {
  const definitionPath = fileURLToPath(url)
  const filename = path.basename(definitionPath)
  const name = filename.slice(0, -skillDefinitionSuffix.length)

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
    definition = skillDefinitionSchema.parse(definitionModule)
  } catch (error) {
    // TODO(HiDeoo)
    throw new Error(`Invalid skill definition '${filename}'.`, { cause: error })
  }

  return { name, url, ...definition }
}

interface SkillConfiguration extends SkillDefinition {
  name: string
  url: URL
}

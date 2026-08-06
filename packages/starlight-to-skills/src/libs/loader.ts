import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

import { ConfigSchema, type StarlightToSkillsConfig } from '../schemas/config'
import { parseSkillName, SkillDefinitionSchema, type SkillDefinition } from '../schemas/skill'

import { computeSkillDigest } from './digest'
import { throwError } from './error'
import { getDataDirUrl, resolveDirectoryUrl } from './fs'
import { discoverSkillDefinitions, getSkillDefinitionUrlByName, getSkillNameByDefinitionUrl } from './skill'
import { loadSkillDocs } from './starlight'

const configFilename = 'starlight-to-skills.config.ts'

const jiti = createJiti(import.meta.url)

export async function loadConfig(rootDir: URL): Promise<StarlightToSkillsConfig> {
  const url = new URL(configFilename, rootDir)

  let configModule: unknown

  try {
    configModule = await jiti.import(fileURLToPath(url), { default: true })
  } catch (error) {
    throwError(`Failed to load configuration file '${configFilename}'.`, {
      cause: error,
      hint: `Run the command from a directory containing a valid '${configFilename}' file.`,
    })
  }

  const result = ConfigSchema.safeParse(configModule)

  if (!result.success) {
    throwError(`Invalid configuration file '${configFilename}'.`, { cause: result.error })
  }

  const config = result.data

  return {
    ...config,
    url,
    rootDir,
    dataDir: getDataDirUrl(rootDir),
    definitionsDir: resolveDirectoryUrl(config.definitionsDir, rootDir),
    outputDir: resolveDirectoryUrl(config.outputDir, rootDir),
  }
}

export async function loadSkillInputs(name: string, rootDir: URL) {
  const config = await loadConfig(rootDir)
  const definitionUrls = await discoverSkillDefinitions(config)
  const inputs = await loadSkillDefinitionInputs(config, getSkillDefinitionUrlByName(definitionUrls, name))

  return { config, ...inputs }
}

export async function loadSkillDefinitionInputs(
  config: Pick<StarlightToSkillsConfig, 'model' | 'rootDir'>,
  definitionUrl: URL,
) {
  const definition = await loadSkillDefinition(definitionUrl)
  const docs = await loadSkillDocs(config, definition)
  const digest = computeSkillDigest(config.model, definition, docs)

  return { definition, docs, digest }
}

async function loadSkillDefinition(url: URL): Promise<SkillConfiguration> {
  const definitionPath = fileURLToPath(url)
  const filename = path.basename(definitionPath)
  const name = parseSkillName(getSkillNameByDefinitionUrl(url))

  let definitionModule: unknown

  try {
    definitionModule = await jiti.import(definitionPath, { default: true })
  } catch (error) {
    throwError(`Failed to load skill definition '${filename}'.`, {
      cause: error,
      hint: `Make sure '${filename}' exists and is a valid skill definition file.`,
    })
  }

  const result = SkillDefinitionSchema.safeParse(definitionModule)

  if (!result.success) {
    throwError(`Invalid skill definition '${filename}'.`, { cause: result.error })
  }

  return { name, url, ...result.data }
}

export interface SkillConfiguration extends SkillDefinition {
  name: string
  url: URL
}

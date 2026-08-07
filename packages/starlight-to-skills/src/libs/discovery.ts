import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { buffer } from 'node:stream/consumers'
import { gzipSync } from 'node:zlib'

import type { APIContext, APIRoute, GetStaticPaths, GetStaticPathsOptions } from 'astro'
import tar from 'tar-stream'

import { parseSkillName } from '../schemas/skill'

import { checkSkill } from './check'
import type { SkillFile } from './content'
import { computeSkillFileDigest, normalizeLineEndings, type SkillFileDigest } from './digest'
import { throwError } from './error'
import { resolveDirectoryUrl, resolveRelativeFilePathUrl } from './fs'
import { loadConfig, loadSkillDefinitionInputs } from './loader'
import {
  discoverSkillDefinitions,
  discoverSkillManifests,
  getSkillNameByDefinitionUrl,
  getSkillNameByManifestUrl,
  loadSkill,
} from './skill'
import { style } from './terminal'

export const DiscoveryPath = '.well-known/agent-skills'
export const DiscoveryIndexRoutePattern = `/${DiscoveryPath}/[file].json`
export const DiscoveryArchiveRoutePattern = `/${DiscoveryPath}/[skill].tar.gz`

// https://github.com/cloudflare/agent-skills-discovery-rfc
export function makeDiscoveryRoute(discoverableSkills: DiscoverableSkills, isDevelopment: boolean) {
  const archives = new Map<string, Promise<SkillArchive>>()

  function getSkillArchive(skill: DiscoverableSkill): Promise<SkillArchive> {
    let archive = archives.get(skill.name)

    if (!archive) {
      archive = makeSkillArchive(skill)
      archives.set(skill.name, archive)
    }

    return archive
  }

  const getStaticPaths = (async ({ routePattern }: Pick<GetStaticPathsOptions, 'routePattern'>) => {
    if (discoverableSkills.skills.length === 0) return []

    if (routePattern === DiscoveryIndexRoutePattern) return [{ params: { file: 'index' } }]

    return discoverableSkills.skills.map((skill) => ({ params: { skill: skill.name } }))
  }) satisfies GetStaticPaths

  const GET = (async ({ logger, params }: Pick<APIContext, 'logger' | 'params'>) => {
    if (isDevelopment && !discoverableSkills.isComplete) {
      logger.warn(`Not all skills are up to date. Run ${style.command('starlight-to-skills check')} for details.`)
    }

    const skillName = params['skill']

    if (!skillName) {
      const skills = await Promise.all(
        discoverableSkills.skills.map(async (skill) => {
          const archive = await getSkillArchive(skill)

          return {
            name: skill.name,
            type: 'archive',
            description: skill.description,
            url: `/${DiscoveryPath}/${skill.name}.tar.gz`,
            digest: archive.digest,
          }
        }),
      )

      return new Response(
        JSON.stringify({ $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json', skills }, undefined, 2),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    const skill = discoverableSkills.skills.find(({ name }) => skillName === name)
    if (!skill) return new Response(null, { status: 404 })

    const archive = await getSkillArchive(skill)

    return new Response(new Uint8Array(archive.bytes), { headers: { 'Content-Type': 'application/gzip' } })
  }) satisfies APIRoute

  return { getStaticPaths, GET }
}

export async function getDiscoverableSkills(rootDir: URL): Promise<DiscoverableSkills> {
  const config = await loadConfig(rootDir)
  const definitionUrls = await discoverSkillDefinitions(config)

  const seen = new Set<string>()
  const skillsByName = new Map<string, DiscoverableSkill>()

  let isComplete = true

  for (const definitionUrl of definitionUrls) {
    try {
      const name = parseSkillName(getSkillNameByDefinitionUrl(definitionUrl))

      seen.add(name)

      const { definition, digest } = await loadSkillDefinitionInputs(config, definitionUrl)
      const skill = await loadSkill(config.outputDir, name)
      const result = checkSkill(skill.manifest, digest, config.model, skill.fileMismatches)

      if (!result.upToDate) {
        isComplete = false
        continue
      }

      skillsByName.set(name, {
        name,
        description: definition.description,
        directory: resolveDirectoryUrl(name, config.outputDir),
        // We sort files to ensure archives are identical given the same skill content.
        files: sortByKey(skill.manifest.files, 'path'),
      })
    } catch {
      isComplete = false
    }
  }

  const manifestUrls = await discoverSkillManifests(config.outputDir)
  const hasOrphans = manifestUrls.some((manifestUrl) => !seen.has(getSkillNameByManifestUrl(manifestUrl)))
  if (hasOrphans) isComplete = false

  // We sort skills to ensure a stable order of the discovery index.
  return { isComplete, skills: sortByKey([...skillsByName.values()], 'name') }
}

async function makeSkillArchive(skill: DiscoverableSkill): Promise<SkillArchive> {
  const files: SkillFile[] = []

  for (const file of skill.files) {
    let content: string

    try {
      content = await fs.readFile(resolveRelativeFilePathUrl(file.path, skill.directory), 'utf8')
    } catch (error) {
      throwError(`Failed to read '${file.path}' from approved skill ${style.skillName(skill.name)}.`, { cause: error })
    }

    const [digest] = computeSkillFileDigest([{ path: file.path, content }])

    if (digest?.contentHash !== file.contentHash) {
      throwError(`Skill ${style.skillName(skill.name)} is not up to date.`)
    }

    files.push({ path: file.path, content })
  }

  const pack = tar.pack()
  const archivePromise = buffer(pack)

  for (const file of files) {
    const content = Buffer.from(normalizeLineEndings(file.content))

    pack.entry({ name: file.path, mtime: new Date(0) }, content)
  }

  pack.finalize()

  const bytes = gzipSync(await archivePromise)

  return { bytes, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }
}

function sortByKey<K extends PropertyKey, T extends Record<K, string>>(values: T[], key: K): T[] {
  return values.toSorted((a, b) => {
    const aKey = a[key]
    const bKey = b[key]
    return aKey === bKey ? 0 : aKey < bKey ? -1 : 1
  })
}

export interface DiscoverableSkills {
  isComplete: boolean
  skills: DiscoverableSkill[]
}

interface DiscoverableSkill {
  name: string
  description: string
  directory: URL
  files: SkillFileDigest[]
}

interface SkillArchive {
  bytes: Buffer
  digest: `sha256:${string}`
}

import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import matter from 'gray-matter'
import { parse as parseToml } from 'smol-toml'

import type { StarlightToSkillsConfig } from '../schemas/config'
import type { SkillDefinition } from '../schemas/skill'

// https://github.com/withastro/starlight/blob/bbab7b19e74de7f1758dafea52b16f8011149cd1/packages/starlight/loaders.ts#L6
export const StarlightDocsExtensionsRegex = /\.(?:markdown|mdown|mkdn|mkd|mdwn|md|mdx)$/

const docsCollectionDir = 'src/content/docs/'

export async function loadSkillDocs(
  config: StarlightToSkillsConfig,
  skill: SkillDefinition,
): Promise<SkillDocumentation[]> {
  const docsCollectionPath = fileURLToPath(new URL(docsCollectionDir, config.rootDir))

  return Promise.all(skill.docs.map((docsPath) => loadSkillDoc(docsCollectionPath, docsPath)))
}

async function loadSkillDoc(docsCollectionPath: string, docsPath: string): Promise<SkillDocumentation> {
  const sourcePath = path.resolve(docsCollectionPath, docsPath)

  let sourceStats: Stats

  try {
    sourceStats = await fs.stat(sourcePath)
  } catch (error) {
    throw new Error(`Failed to load documentation source '${docsPath}'.`, { cause: error })
  }

  if (!sourceStats.isFile()) throw new Error(`Documentation source '${docsPath}' is not a file.`)

  let source: string

  try {
    source = await fs.readFile(sourcePath, 'utf8')
  } catch (error) {
    throw new Error(`Failed to read documentation source '${docsPath}'.`, { cause: error })
  }

  const frontmatter = parseFrontmatter(source, docsPath)

  if (typeof frontmatter.data['title'] !== 'string') {
    // TODO(HiDeoo)
    throw new TypeError(`Documentation source '${docsPath}' must have a valid 'title' frontmatter property.`)
  }

  return {
    url: pathToFileURL(sourcePath),
    title: frontmatter.data['title'],
    body: frontmatter.content,
  }
}

function parseFrontmatter(source: string, sourcePath: string) {
  const normalizedSource = source.trimStart()

  const options = normalizedSource.startsWith('+++')
    ? { delimiters: '+++', engines: { toml: parseToml }, language: 'toml' }
    : undefined

  try {
    return matter(normalizedSource, options)
  } catch (error) {
    // TODO(HiDeoo)
    throw new Error(`Failed to parse documentation source '${sourcePath}'.`, { cause: error })
  }
}

export interface SkillDocumentation {
  url: URL
  title: string
  body: string
}

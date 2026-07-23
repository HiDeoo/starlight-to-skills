import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import matter from 'gray-matter'
import { parse as parseToml } from 'smol-toml'

import type { StarlightToSkillsConfig } from '../schemas/config'
import type { SkillDefinition } from '../schemas/skill'

import { throwError } from './error'
import { isFileNotFoundError } from './fs'

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
  const normalizedDocsPath = path.normalize(docsPath)
  const [firstSegment] = normalizedDocsPath.split(path.sep)

  if (path.parse(normalizedDocsPath).root !== '' || firstSegment === '..') {
    throwError(`Documentation file '${docsPath}' must be inside '${docsCollectionDir}'.`, {
      hint: `Use a path relative to '${docsCollectionDir}'.`,
    })
  }

  const sourcePath = path.resolve(docsCollectionPath, docsPath)

  let sourceStats: Stats

  try {
    sourceStats = await fs.stat(sourcePath)
  } catch (error) {
    const message = `Failed to load documentation file '${docsPath}'.`

    if (isFileNotFoundError(error)) {
      throwError(message, { hint: 'Check the path in the skill definition and try again.' })
    }

    throwError(message, { cause: error })
  }

  if (!sourceStats.isFile()) {
    throwError(`Documentation path '${docsPath}' is not a file.`, {
      hint: 'Specify a Markdown or MDX file in the skill definition and try again.',
    })
  }

  let source: string

  try {
    source = await fs.readFile(sourcePath, 'utf8')
  } catch (error) {
    throwError(`Failed to read documentation file '${docsPath}'.`, { cause: error })
  }

  const frontmatter = parseFrontmatter(source, docsPath)

  if (typeof frontmatter.data['title'] !== 'string') {
    throwError(`Documentation file '${docsPath}' has an invalid title.`, {
      hint: `Fix 'title' in the file's frontmatter and try again.`,
    })
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
    throwError(`Failed to parse documentation file '${sourcePath}'.`, { cause: error })
  }
}

export interface SkillDocumentation {
  url: URL
  title: string
  body: string
}

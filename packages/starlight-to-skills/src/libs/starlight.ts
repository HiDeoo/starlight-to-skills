import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

  return Promise.all(skill.docs.map((docPath) => loadSkillDoc(docsCollectionPath, docPath)))
}

async function loadSkillDoc(docsCollectionPath: string, docPath: string): Promise<SkillDocumentation> {
  const normalizedDocPath = path.normalize(docPath)
  const [firstSegment] = normalizedDocPath.split(path.sep)

  if (path.parse(normalizedDocPath).root !== '' || firstSegment === '..') {
    throwError(`Documentation file '${docPath}' must be inside '${docsCollectionDir}'.`, {
      hint: `Use a path relative to '${docsCollectionDir}'.`,
    })
  }

  const filePath = path.resolve(docsCollectionPath, docPath)

  let fileStats: Stats

  try {
    fileStats = await fs.stat(filePath)
  } catch (error) {
    const message = `Failed to load documentation file '${docPath}'.`

    if (isFileNotFoundError(error)) {
      throwError(message, { hint: 'Check the path in the skill definition and try again.' })
    }

    throwError(message, { cause: error })
  }

  if (!fileStats.isFile()) {
    throwError(`Documentation path '${docPath}' is not a file.`, {
      hint: 'Specify a Markdown or MDX file in the skill definition and try again.',
    })
  }

  let content: string

  try {
    content = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    throwError(`Failed to read documentation file '${docPath}'.`, { cause: error })
  }

  const frontmatter = parseFrontmatter(content, docPath)

  if (typeof frontmatter.data['title'] !== 'string') {
    throwError(`Documentation file '${docPath}' has an invalid title.`, {
      hint: `Fix 'title' in the file's frontmatter and try again.`,
    })
  }

  return {
    path: docPath,
    title: frontmatter.data['title'],
    body: frontmatter.content,
  }
}

function parseFrontmatter(content: string, docPath: string) {
  const normalizedContent = content.trimStart()

  const options = normalizedContent.startsWith('+++')
    ? { delimiters: '+++', engines: { toml: parseToml }, language: 'toml' }
    : undefined

  try {
    return matter(normalizedContent, options)
  } catch (error) {
    throwError(`Failed to parse documentation file '${docPath}'.`, { cause: error })
  }
}

export interface SkillDocumentation {
  path: string
  title: string
  body: string
}

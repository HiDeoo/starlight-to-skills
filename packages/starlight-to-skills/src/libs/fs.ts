import type { PathLike } from 'node:fs'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { throwError } from './error'

const pluginDirectoryName = '.starlight-to-skills'

export function getDataDirUrl(rootDir: URL): URL {
  return resolveDirectoryUrl(pluginDirectoryName, rootDir)
}

export function getSkillManifestDirUrl(outputDir: URL): URL {
  return resolveDirectoryUrl(pluginDirectoryName, outputDir)
}

export function getSkillManifestUrl(outputDir: URL, name: string): URL {
  return new URL(`${name}.json`, getSkillManifestDirUrl(outputDir))
}

export function resolveDirectoryUrl(directoryPath: string, base: URL): URL {
  return resolveRelativeFilePathUrl(directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`, base)
}

export function resolveRelativeFilePathUrl(filePath: string, base: URL): URL {
  return new URL(filePath.split('/').map(encodeURIComponent).join('/'), base)
}

export async function ensureDirectory(url: URL) {
  const directoryUrl = new URL(url)

  if (directoryUrl.pathname.endsWith('/')) {
    // A trailing slash makes `stat()` throw `ENOTDIR` when a file exists at the path.
    directoryUrl.pathname = directoryUrl.pathname.slice(0, -1)
  }

  try {
    const stats = await fs.stat(directoryUrl)
    if (!stats.isDirectory()) {
      throwError(
        `Failed to create directory '${fileURLToPath(directoryUrl)}' because a file already exists at that path.`,
        { hint: 'Move the existing file and try again.' },
      )
    }
  } catch (error) {
    if (!isFileNotFoundError(error)) throw error
    await fs.mkdir(directoryUrl, { recursive: true })
  }
}

export async function pathExists(path: PathLike) {
  try {
    await fs.stat(path)
    return true
  } catch (error) {
    if (isFileNotFoundError(error)) return false
    throw error
  }
}

export function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

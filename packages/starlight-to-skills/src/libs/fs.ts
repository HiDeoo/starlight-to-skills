import fs from 'node:fs/promises'

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
  try {
    const stats = await fs.stat(url)
    if (!stats.isDirectory()) throw new Error(`Failed to create directory because a file already exists at '${url}'.`)
  } catch (error) {
    if (!isFileNotFoundError(error)) throw error
    await fs.mkdir(url, { recursive: true })
  }
}

export async function pathExists(url: URL) {
  try {
    await fs.stat(url)
    return true
  } catch (error) {
    if (isFileNotFoundError(error)) return false
    throw error
  }
}

export function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

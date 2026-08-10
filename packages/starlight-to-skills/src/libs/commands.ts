import process, { loadEnvFile } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'

import packageJson from '../../package.json' with { type: 'json' }
import { ContentResultIssueLabels } from '../schemas/content'
import { parseSkillName } from '../schemas/skill'

import { approveCandidate, createCandidate, loadCandidate, removeCandidateForInput, writeCandidate } from './candidate'
import { checkSkills, getSkillIssues } from './check'
import { compileSkill, generateSkillContent, type SkillUpdate } from './content'
import { renderSkillDiff } from './diff'
import { createError, throwError } from './error'
import { getSkillManifestUrl, pathExists, pathToDirectoryUrl } from './fs'
import { getHelp } from './help'
import { loadConfig, loadSkillInputs } from './loader'
import {
  approveSkill,
  discoverSkillDefinitions,
  discoverSkillManifests,
  getSkillNameByDefinitionUrl,
  getSkillNameByManifestUrl,
  loadSkill,
  pruneSkill,
  type LoadedSkill,
} from './skill'
import { logError, logMessage, logUsageError, pluralize, prefixLines, style, withProgress } from './terminal'

export async function runCli(args: string[], cwd = process.cwd()): Promise<number> {
  let parsedArgs: ReturnType<typeof parseArgs>

  try {
    parsedArgs = parseArgs({
      args,
      allowPositionals: true,
      options: {
        existing: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        yes: { type: 'boolean', short: 'y' },
      },
      strict: true,
    })
  } catch (error) {
    return logUsageError(error)
  }

  const [command, ...commandArgs] = parsedArgs.positionals

  if (parsedArgs.values['help']) {
    logMessage(getHelp(command))
    return 0
  }

  if (parsedArgs.values['version']) {
    logMessage(packageJson.version)
    return 0
  }

  if (!command) return logUsageError('Missing command.')

  if (parsedArgs.values['existing'] && command !== 'approve') {
    return logUsageError("Option '--existing' is only valid for command 'approve'.", 'approve')
  } else if (parsedArgs.values['yes'] && command !== 'prune') {
    return logUsageError("Option '--yes' is only valid for command 'prune'.", 'prune')
  }

  const rootDir = pathToDirectoryUrl(cwd)

  if (command === 'prune') {
    if (commandArgs.length > 0) return logUsageError("Command 'prune' accepts no arguments.", 'prune')

    try {
      return await runPruneSkills(rootDir, parsedArgs.values['yes'] === true)
    } catch (error) {
      return logError(error)
    }
  }

  if (command === 'generate' || command === 'approve' || command === 'check') {
    const [name, ...extraNames] = commandArgs

    if (extraNames.length > 0) return logUsageError(`Command '${command}' accepts only one skill name.`, command)

    if (command === 'check') {
      try {
        return name ? await runCheckSkill(name, rootDir) : await runCheckSkills(rootDir)
      } catch (error) {
        return logError(error)
      }
    }

    if (!name) return logUsageError(`Command '${command}' requires a skill name.`, command)

    try {
      if (command === 'generate') return await runGenerateCandidate(name, rootDir)
      return await runApproveSkill(name, rootDir, parsedArgs.values['existing'] === true)
    } catch (error) {
      return logError(error)
    }
  }

  return logUsageError(`Unknown command '${command}'.`)
}

async function runGenerateCandidate(name: string, rootDir: URL): Promise<number> {
  const envUrl = new URL('.env', rootDir)
  if (await pathExists(envUrl)) loadEnvFile(envUrl)

  const { config, definition, docs, digest } = await loadSkillInputs(name, rootDir)
  let approvedSkill: LoadedSkill | undefined
  let update: SkillUpdate | undefined

  if (await pathExists(getSkillManifestUrl(config.outputDir, definition.name))) {
    approvedSkill = await loadSkill(config.outputDir, definition.name)

    if (approvedSkill.fileMismatches.length === 0) {
      const approvedDocHashes = new Map(approvedSkill.manifest.docs.map(({ path, contentHash }) => [path, contentHash]))
      const changedDocPaths: string[] = []

      for (const { path, contentHash } of digest.docs) {
        if (approvedDocHashes.get(path) !== contentHash) changedDocPaths.push(path)
        approvedDocHashes.delete(path)
      }

      changedDocPaths.push(...approvedDocHashes.keys())

      update = { approvedFiles: approvedSkill.files, changedDocPaths }
    }
  }

  const content = await withProgress(`Generating ${style.skillName(definition.name)}...`, () =>
    generateSkillContent(config.model, definition, docs, update),
  )

  if (content.status === 'error') {
    try {
      await removeCandidateForInput(config.dataDir, definition.name, digest.inputHash)
    } catch (error) {
      throwError(`Could not generate ${style.skillName(definition.name)}.`, { cause: error })
    }

    const issues = content.issues
      .map((issue) => {
        const paragraphs = [style.section(ContentResultIssueLabels[issue.type]), issue.details]

        if (issue.docPaths.length > 0) {
          paragraphs.push(
            style.dim(`${pluralize(issue.docPaths.length, 'Documentation file')}:`),
            issue.docPaths.map((docPath) => `${style.dim(' -')} ${docPath}`).join('\n'),
          )
        }

        return paragraphs.join('\n\n')
      })
      .join('\n\n')

    return logError(
      createError(`Could not generate ${style.skillName(definition.name)}.\n\n${issues}`, {
        hint: `Resolve these issues and run ${style.command(`starlight-to-skills generate ${definition.name}`)} again.`,
      }),
    )
  }

  let candidate: ReturnType<typeof createCandidate>

  try {
    candidate = createCandidate(digest.inputHash, compileSkill(definition, content))
  } catch (error) {
    throwError(`Could not generate ${style.skillName(definition.name)}.`, {
      cause: error,
      hint: `Run ${style.command(`starlight-to-skills generate ${definition.name}`)} again.`,
    })
  }

  await writeCandidate(config.dataDir, definition.name, candidate)

  let files = candidate.files
    .map((file) => `${style.section(file.path)}\n\n${prefixLines(file.content, '  ')}`)
    .join('\n\n')

  let reviewMessage = 'Review the generated skill.'

  if (approvedSkill?.fileMismatches.length === 0) {
    files = renderSkillDiff(approvedSkill.files, candidate.files)

    const approvedFileHashes = new Map(
      approvedSkill.manifest.files.map(({ path, contentHash }) => [path, contentHash]),
    )
    const hasFileChanges =
      candidate.fileDigests.length !== approvedFileHashes.size ||
      candidate.fileDigests.some(({ path, contentHash }) => approvedFileHashes.get(path) !== contentHash)

    reviewMessage = hasFileChanges
      ? 'Review changes to the generated skill.'
      : 'The generated skill has no file changes from the approved skill.'
  }

  const nextSteps = [
    style.primarySection('Next steps'),
    '',
    reviewMessage,
    '',
    `${style.dim(' -')} To make changes, update the skill definition or documentation, then run ${style.command(`starlight-to-skills generate ${definition.name}`)} again.`,
    `${style.dim(' -')} To approve it, run ${style.command(`starlight-to-skills approve ${definition.name}`)}.`,
  ].join('\n')

  logMessage(`${style.success('Generated')} ${style.skillName(definition.name)}.\n\n${files}\n\n${nextSteps}`)
  return 0
}

async function runApproveSkill(name: string, rootDir: URL, existing: boolean): Promise<number> {
  const { config, definition, digest } = await loadSkillInputs(name, rootDir)

  if (existing) {
    await approveSkill(config, definition, digest)

    logMessage(`${style.success('Approved')} ${style.skillName(definition.name)}.`)
    return 0
  }

  const candidate = await loadCandidate(config.dataDir, definition.name, digest.inputHash)
  const result = await approveCandidate(config, definition, digest, candidate)

  logMessage(
    `${style.success(result === 'approved' ? 'Approved' : 'Already approved')} ${style.skillName(definition.name)}.`,
  )
  return 0
}

async function runCheckSkill(name: string, rootDir: URL): Promise<number> {
  const { config, definition, digest } = await loadSkillInputs(name, rootDir)
  const issues = await getSkillIssues(config, definition, digest)

  if (!issues) {
    logMessage(`${style.success('Check complete:')} ${style.skillName(definition.name)} is up to date.`)
    return 0
  }

  return logError(issues)
}

async function runCheckSkills(rootDir: URL): Promise<number> {
  logMessage(await checkSkills(rootDir))
  return 0
}

async function runPruneSkills(rootDir: URL, yes: boolean): Promise<number> {
  const config = await loadConfig(rootDir)
  const definitionUrls = await discoverSkillDefinitions(config)
  const definitionNames = new Set(definitionUrls.map((url) => parseSkillName(getSkillNameByDefinitionUrl(url))))
  const manifestUrls = await discoverSkillManifests(config.outputDir)
  const manifests = manifestUrls.map((manifestUrl) => ({
    manifestUrl,
    name: parseSkillName(getSkillNameByManifestUrl(manifestUrl)),
  }))
  const orphans: { manifestUrl: URL; name: string }[] = []

  for (const manifest of manifests) {
    if (!definitionNames.has(manifest.name)) orphans.push(manifest)
  }

  if (orphans.length === 0) {
    logMessage('No orphan approved skills to prune.')
    return 0
  }

  const orphanNames = orphans.map((orphan) => `${style.dim(' -')} ${style.primary(orphan.name)}`).join('\n')

  logMessage(`${style.bold('Orphan approved skills:')}\n\n${orphanNames}\n`)

  if (!yes) {
    if (process.stdin.isTTY !== true) {
      throwError('Pruning requires confirmation but no interactive terminal is available.', {
        hint: `Run ${style.command('starlight-to-skills prune --yes')}.`,
      })
    }

    const readline = createInterface({ input: process.stdin, output: process.stdout })

    try {
      const answer = await readline.question(
        `Prune ${orphans.length} ${pluralize(orphans.length, 'orphan approved skill')}? ${style.dim('[y/N]')} `,
      )
      logMessage('')

      if (!['y', 'yes'].includes(answer.trim().toLowerCase())) {
        logMessage('Pruning cancelled.')
        return 0
      }
    } finally {
      readline.close()
    }
  }

  for (const orphan of orphans) {
    try {
      await pruneSkill(config.outputDir, orphan.name)
    } catch (error) {
      throwError(`Failed to prune ${style.skillName(orphan.name)}.`, { cause: error })
    }

    logMessage(`${style.success('Pruned')} ${style.skillName(orphan.name)}.`)
  }

  return 0
}

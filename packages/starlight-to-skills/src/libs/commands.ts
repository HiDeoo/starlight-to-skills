import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import packageJson from '../../package.json' with { type: 'json' }
import type { StarlightToSkillsConfig } from '../schemas/config'
import { ContentResultIssueLabels } from '../schemas/content'
import type { SkillDigest } from '../schemas/digest'
import { parseSkillName } from '../schemas/skill'

import { approveCandidate, createCandidate, loadCandidate, removeCandidateForInput, writeCandidate } from './candidate'
import { compileSkill, generateSkillContent, type SkillUpdate } from './content'
import { renderSkillDiff } from './diff'
import { computeSkillDigest, GeneratorVersion } from './digest'
import { createError, type StarlightToSkillsError, throwError } from './error'
import { getSkillManifestUrl, pathExists } from './fs'
import { getHelp } from './help'
import { loadConfig, loadSkillDefinition, type SkillConfiguration } from './loader'
import {
  approveSkill,
  checkSkill,
  discoverSkillDefinitions,
  discoverSkillManifests,
  getSkillDefinitionUrlByName,
  getSkillNameByDefinitionUrl,
  getSkillNameByManifestUrl,
  hasMatchingSkillDescription,
  loadSkill,
  pruneSkill,
  SkillCheckIssueMessages,
  type LoadedSkill,
} from './skill'
import { loadSkillDocs } from './starlight'
import {
  formatError,
  logError,
  logMessage,
  logUsageError,
  pluralize,
  prefixLines,
  style,
  withProgress,
} from './terminal'

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

  const rootDir = pathToFileURL(path.join(cwd, path.sep))

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
  const { config, definition, docs, digest } = await loadSkillInputs(name, rootDir)
  let approvedSkill: LoadedSkill | undefined
  let update: SkillUpdate | undefined

  if (await pathExists(getSkillManifestUrl(config.outputDir, definition.name))) {
    approvedSkill = await loadSkill(config.outputDir, definition.name)

    if (approvedSkill.fileMismatches.length === 0) {
      const approvedSourceHashes = new Map(
        approvedSkill.manifest.sources.map(({ docsPath, contentHash }) => [docsPath, contentHash]),
      )
      const changedDocsPaths: string[] = []

      for (const { docsPath, contentHash } of digest.sources) {
        if (approvedSourceHashes.get(docsPath) !== contentHash) changedDocsPaths.push(docsPath)
        approvedSourceHashes.delete(docsPath)
      }

      changedDocsPaths.push(...approvedSourceHashes.keys())

      update = { approvedFiles: approvedSkill.files, changedDocsPaths }
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

        if (issue.docsPaths.length > 0) {
          paragraphs.push(
            style.dim(`${pluralize(issue.docsPaths.length, 'Documentation file')}:`),
            issue.docsPaths.map((docsPath) => `${style.dim(' -')} ${docsPath}`).join('\n'),
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
    reviewMessage = 'Review changes to the generated skill.'
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
  const config = await loadConfig(rootDir)
  const definitionUrls = await discoverSkillDefinitions(config)
  const reports: string[] = []
  let allUpToDate = true
  let hasOrphans = false
  const definitionNames = new Set<string>()

  function addReport(name: string, details: unknown) {
    reports.push(`${style.primarySection(name)}\n\n${formatError(details)}`)
  }

  for (const definitionUrl of definitionUrls) {
    const name = getSkillNameByDefinitionUrl(definitionUrl)

    try {
      definitionNames.add(parseSkillName(name))
    } catch (error) {
      allUpToDate = false
      addReport(name, error)
    }
  }

  for (const name of definitionNames) {
    try {
      const definitionUrl = getSkillDefinitionUrlByName(definitionUrls, name)
      const { definition, digest } = await loadSkillDefinitionInputs(config, definitionUrl)
      const issues = await getSkillIssues(config, definition, digest)

      if (issues) {
        allUpToDate = false
        addReport(name, issues)
      }
    } catch (error) {
      allUpToDate = false
      addReport(name, error)
    }
  }

  for (const skillManifestUrl of await discoverSkillManifests(config.outputDir)) {
    const name = getSkillNameByManifestUrl(skillManifestUrl)
    let skillName: string

    try {
      skillName = parseSkillName(name)
    } catch (error) {
      allUpToDate = false
      addReport(name, error)
      continue
    }

    if (definitionNames.has(skillName)) continue

    allUpToDate = false
    hasOrphans = true
    addReport(skillName, 'Orphan approved skill.')
  }

  const report = reports.join('\n\n')

  if (!allUpToDate) {
    const message = `Not all skills are up to date.\n\n${report}`
    return logError(
      hasOrphans
        ? createError(message, {
            hint: `Run ${style.command('starlight-to-skills prune')} to review and remove orphan approved skills.`,
          })
        : message,
    )
  }

  logMessage(
    `${style.success('Check complete:')} ${definitionNames.size === 0 ? 'no skills found.' : 'all skills are up to date.'}`,
  )
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

async function loadSkillInputs(name: string, rootDir: URL) {
  const config = await loadConfig(rootDir)
  const definitionUrls = await discoverSkillDefinitions(config)
  const inputs = await loadSkillDefinitionInputs(config, getSkillDefinitionUrlByName(definitionUrls, name))

  return { config, ...inputs }
}

async function loadSkillDefinitionInputs(config: StarlightToSkillsConfig, definitionUrl: URL) {
  const definition = await loadSkillDefinition(definitionUrl)
  const docs = await loadSkillDocs(config, definition)
  const digest = computeSkillDigest(config.model, definition, docs)

  return { definition, docs, digest }
}

async function getSkillIssues(
  config: StarlightToSkillsConfig,
  definition: SkillConfiguration,
  digest: SkillDigest,
): Promise<StarlightToSkillsError | undefined> {
  const approveCommand = style.command(`starlight-to-skills approve ${definition.name}`)
  const generateCommand = style.command(`starlight-to-skills generate ${definition.name}`)
  const generateHint = `Run ${generateCommand}, review the generated skill, and then run ${approveCommand}.`

  if (!(await pathExists(getSkillManifestUrl(config.outputDir, definition.name)))) {
    return createError(`Skill ${style.skillName(definition.name)} has not been approved.`, { hint: generateHint })
  }

  const { manifest, fileMismatches } = await loadSkill(config.outputDir, definition.name)
  const result = checkSkill(manifest, digest, config.model, fileMismatches)

  if (result.upToDate) return

  const issues = result.issues.map((issue) => {
    const heading = style.section(SkillCheckIssueMessages[issue.type])

    switch (issue.type) {
      case 'definition-change': {
        return `${heading}\n\nThe description, documentation file paths, or guidance changed since the skill was approved.`
      }
      case 'approved-skill-change':
      case 'source-change': {
        const paths = issue.paths.map((path) => `${style.dim(' -')} ${path}`).join('\n')

        return `${heading}\n\n${paths}`
      }
      case 'model-change': {
        return `${heading}\n\n${style.dim(' - Before:')} ${manifest.model}\n${style.dim(' - Now:')} ${config.model}`
      }
      case 'generator-change': {
        return `${heading}\n\n${style.dim(' - Before:')} ${manifest.generatorVersion}\n${style.dim(' - Now:')} ${GeneratorVersion}`
      }
      default: {
        throw new Error(`Unexpected issue: ${JSON.stringify(issue satisfies never)}`)
      }
    }
  })

  const canApproveExistingSkill =
    fileMismatches.length === 0 &&
    (manifest.definitionHash === digest.definitionHash ||
      (await hasMatchingSkillDescription(config.outputDir, definition.name, definition.description)))

  const hints =
    fileMismatches.length > 0
      ? [
          `Restore the listed files. To keep intended changes, update the skill definition or documentation, run ${generateCommand}, review the generated skill, and then run ${approveCommand}.`,
        ]
      : [generateHint]

  if (canApproveExistingSkill) {
    hints.push(
      `Alternatively, if the existing approved skill is still valid, run ${style.command(`starlight-to-skills approve ${definition.name} --existing`)}.`,
    )
  }

  return createError(`Skill ${style.skillName(definition.name)} is not up to date.\n\n${issues.join('\n\n')}`, {
    hint: hints.join(' '),
  })
}

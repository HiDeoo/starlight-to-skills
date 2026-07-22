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
import { compileSkill, generateSkillContent } from './content'
import { computeSkillDigest } from './digest'
import { createError, StarlightToSkillsError, throwError } from './error'
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
} from './skill'
import { loadSkillDocs } from './starlight'
import { bold, dim, error, hint, primary, section, success } from './style'

// TODO(HiDeoo) show generated file contents for new skills and a unified diff for updates.
// TODO(HiDeoo) Progress/logs

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
  const content = await generateSkillContent(config.model, definition, docs)

  if (content.status === 'error') {
    try {
      await removeCandidateForInput(config.dataDir, definition.name, digest.inputHash)
    } catch (error) {
      throwError(`Could not generate '${primary(definition.name)}'.`, { cause: error })
    }

    const issues = content.issues
      .map((issue) => {
        const paths = issue.docsPaths.map((docsPath) => `${dim(' -')} ${docsPath}`).join('\n')

        // TODO(HiDeoo) pluralize
        return `${section(ContentResultIssueLabels[issue.type])}

${issue.details}

${dim(`${issue.docsPaths.length === 1 ? 'Documentation file' : 'Documentation files'}:`)}

${paths}`
      })
      .join('\n\n')

    return logError(
      createError(`Could not generate '${primary(definition.name)}'.\n\n${issues}`, {
        hint: `Resolve these issues and run 'starlight-to-skills generate ${definition.name}' again.`,
      }),
    )
  }

  let candidate: ReturnType<typeof createCandidate>

  try {
    candidate = createCandidate(digest.inputHash, compileSkill(definition, content))
  } catch (error) {
    throwError(`Could not generate '${primary(definition.name)}'.`, {
      cause: error,
      hint: `Run 'starlight-to-skills generate ${definition.name}' again.`,
    })
  }

  await writeCandidate(config.dataDir, definition.name, candidate)

  const paths = candidate.files.map((file) => `${dim(' -')} ${file.path}`).join('\n')

  logMessage(`${success('Generated')} '${primary(definition.name)}'.\n\n${paths}`)
  return 0
}

// TODO(HiDeoo) running multiple times without changes re-aprove indefinitely?
async function runApproveSkill(name: string, rootDir: URL, existing: boolean): Promise<number> {
  const { config, definition, digest } = await loadSkillInputs(name, rootDir)

  if (existing) {
    await approveSkill(config, definition, digest)

    logMessage(`${success('Approved')} '${primary(definition.name)}'.`)
    return 0
  }

  const candidate = await loadCandidate(config.dataDir, definition.name, digest.inputHash)
  await approveCandidate(config, definition, digest, candidate)

  logMessage(`${success('Approved')} '${primary(definition.name)}'.`)
  return 0
}

async function runCheckSkill(name: string, rootDir: URL): Promise<number> {
  const { config, definition, digest } = await loadSkillInputs(name, rootDir)
  const issues = await getSkillIssues(config, definition, digest)

  if (!issues) {
    // TODO(HiDeoo)
    logMessage('Ok')
    return 0
  }

  return logError(issues)
}

async function runCheckSkills(rootDir: URL): Promise<number> {
  const config = await loadConfig(rootDir)
  const definitionUrls = await discoverSkillDefinitions(config)
  const reports: string[] = []
  let allCurrent = true
  const definitionNames = new Set<string>()

  for (const definitionUrl of definitionUrls) {
    const name = getSkillNameByDefinitionUrl(definitionUrl)

    try {
      definitionNames.add(parseSkillName(name))
    } catch (error) {
      allCurrent = false
      reports.push(`${name}: Issue\n\n${formatError(error)}`)
    }
  }

  for (const name of definitionNames) {
    try {
      const definitionUrl = getSkillDefinitionUrlByName(definitionUrls, name)
      const { definition, digest } = await loadSkillDefinitionInputs(config, definitionUrl)
      const issues = await getSkillIssues(config, definition, digest)

      if (issues) {
        allCurrent = false
        reports.push(`${name}: Issue\n\n${formatError(issues)}`)
      } else {
        reports.push(`${name}: Ok`)
      }
    } catch (error) {
      allCurrent = false
      reports.push(`${name}: Issue\n\n${formatError(error)}`)
    }
  }

  for (const skillManifestUrl of await discoverSkillManifests(config.outputDir)) {
    const name = getSkillNameByManifestUrl(skillManifestUrl)
    let skillName: string

    try {
      skillName = parseSkillName(name)
    } catch (error) {
      allCurrent = false
      reports.push(`${name}: Issue\n\n${formatError(error)}`)
      continue
    }

    if (definitionNames.has(skillName)) continue

    allCurrent = false
    reports.push(`${skillName}: Issue\n\nOrphan approved skill.`)
  }

  const report = reports.join('\n\n')

  if (!allCurrent) return logError(report)
  if (report) logMessage(report)
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

  logMessage(
    `${bold('Orphan approved skills:')}

${orphans.map((orphan) => `${dim(' -')} ${primary(orphan.name)}`).join('\n')}
`,
  )

  if (!yes) {
    if (process.stdin.isTTY !== true) {
      throwError('Pruning requires confirmation but no interactive terminal is available.', {
        hint: "Run 'starlight-to-skills prune --yes'.",
      })
    }

    const readline = createInterface({ input: process.stdin, output: process.stdout })

    try {
      // TODO(HiDeoo) plural
      const answer = await readline.question(`Prune ${orphans.length} orphan approved skills? ${dim('[y/N]')} `)
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
      throwError(`Failed to prune '${orphan.name}'.`, { cause: error })
    }

    logMessage(`${success('Pruned')} '${primary(orphan.name)}'.`)
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
  const generateHint = `Run 'starlight-to-skills generate ${definition.name}' to generate a new candidate.`

  if (!(await pathExists(getSkillManifestUrl(config.outputDir, definition.name)))) {
    // TODO(HiDeoo) no colon
    return createError('Issues:\n\n- Never approved', { hint: generateHint })
  }

  const { manifest, fileMismatches } = await loadSkill(config.outputDir, definition.name)
  const result = checkSkill(manifest, digest, config.model, fileMismatches)

  if (result.current) return

  const issues = result.issues.map((issue) => {
    const paths = issue.type === 'approved-skill-change' ? `: ${issue.paths.join(' - ')}` : ''
    return `- ${SkillCheckIssueMessages[issue.type]}${paths}`
  })

  const canApproveExistingSkill =
    fileMismatches.length === 0 &&
    (manifest.definitionHash === digest.definitionHash ||
      (await hasMatchingSkillDescription(config.outputDir, definition.name, definition.description)))

  const hints = [generateHint]

  if (canApproveExistingSkill) {
    hints.push(
      `If the existing approved skill is still valid, run 'starlight-to-skills approve ${definition.name} --existing'.`,
    )
  }

  // TODO(HiDeoo) no colon
  return createError(`Issues:\n\n${issues.join('\n')}`, { hint: hints.join('\n\n') })
}

function logMessage(message: string) {
  // eslint-disable-next-line no-console
  console.log(message)
}

function logUsageError(error: unknown, command?: string): number {
  const helpCommand = command ? ` ${command}` : ''
  return logError(
    createError(formatError(error), { hint: `Run 'starlight-to-skills${helpCommand} --help' for more information.` }),
  )
}

function logError(maybeError: unknown): number {
  console.error(`${error('Error:')} ${formatError(maybeError)}`)
  return 1
}

function formatError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'An unknown error occurred.'

  if (!(error instanceof StarlightToSkillsError) || !error.hint) {
    return message
  }

  return `${message}\n\n${hint('Hint:')} ${error.hint}`
}

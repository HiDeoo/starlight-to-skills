import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import packageJson from '../../package.json' with { type: 'json' }
import type { StarlightToSkillsConfig } from '../schemas/config'
import { ContentResultIssueLabels } from '../schemas/content'
import type { SkillDigest } from '../schemas/digest'

import { approveCandidate, createCandidate, loadCandidate, removeCandidateForInput, writeCandidate } from './candidate'
import { compileSkill, generateSkillContent } from './content'
import { computeSkillDigest } from './digest'
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

// TODO(HiDeoo) CLI UI
// TODO(HiDeoo) Progress/logs

const help = `Usage: starlight-to-skills <command> [options]

Commands:
  approve  <name>  Approve the current candidate for a skill
  check    [name]  Check whether one or all approved skills are up to date
  generate <name>  Generate a candidate for a skill
  prune            Remove orphan approved skills

Options:
      --existing  Approve the existing approved skill
  -y, --yes       Skip confirmation
  -h, --help      Show help
  -v, --version   Show version`

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
    return logUsageError(error instanceof Error ? error.message : String(error))
  }

  if (parsedArgs.values['help']) {
    logMessage(help)
    return 0
  }

  if (parsedArgs.values['version']) {
    logMessage(packageJson.version)
    return 0
  }

  const [command, ...commandArgs] = parsedArgs.positionals

  if (!command) return logUsageError('Missing command.')

  if (parsedArgs.values['existing'] && command !== 'approve') {
    return logUsageError("Option '--existing' is only valid for command 'approve'.")
  } else if (parsedArgs.values['yes'] && command !== 'prune') {
    return logUsageError("Option '--yes' is only valid for command 'prune'.")
  }

  const rootDir = pathToFileURL(path.join(cwd, path.sep))

  if (command === 'prune') {
    if (commandArgs.length > 0) return logUsageError("Command 'prune' accepts no arguments.")

    try {
      return await runPruneSkills(rootDir, parsedArgs.values['yes'] === true)
    } catch (error) {
      return logError(error instanceof Error ? error.message : String(error))
    }
  }

  if (command === 'generate' || command === 'approve' || command === 'check') {
    const [name, ...extraNames] = commandArgs

    if (extraNames.length > 0) return logUsageError(`Command '${command}' accepts only one skill name.`)

    if (command === 'check') {
      try {
        return name ? await runCheckSkill(name, rootDir) : await runCheckSkills(rootDir)
      } catch (error) {
        return logError(error instanceof Error ? error.message : String(error))
      }
    }

    if (!name) return logUsageError(`Missing skill name for command '${command}'.`)

    try {
      if (command === 'generate') return await runGenerateCandidate(name, rootDir)
      return await runApproveSkill(name, rootDir, parsedArgs.values['existing'] === true)
    } catch (error) {
      return logError(error instanceof Error ? error.message : String(error))
    }
  }

  return logUsageError(`Unknown command '${command}'.`)
}

async function runGenerateCandidate(name: string, rootDir: URL): Promise<number> {
  const { config, definition, docs, digest } = await loadSkillInputs(name, rootDir)
  const content = await generateSkillContent(config.model, definition, docs)

  if (content.status === 'error') {
    await removeCandidateForInput(config.dataDir, definition.name, digest.inputHash)
    // TODO(HiDeoo) hint on how to fix the issues?
    return logError(
      content.issues
        .map((issue) => {
          return `${ContentResultIssueLabels[issue.type]}: ${issue.details}\nDocumentation sources: ${issue.docsPaths.join(' - ')}`
        })
        .join('\n\n'),
    )
  }

  const candidate = createCandidate(digest.inputHash, compileSkill(definition, content))

  const candidateUrl = await writeCandidate(config.dataDir, definition.name, candidate)

  // TODO(HiDeoo)
  logMessage(`Candidate written to '${fileURLToPath(candidateUrl)}'.`)
  return 0
}

async function runApproveSkill(name: string, rootDir: URL, existing: boolean): Promise<number> {
  const { config, definition, digest } = await loadSkillInputs(name, rootDir)

  if (existing) {
    const approvedSkillUrl = await approveSkill(config, definition, digest)

    // TODO(HiDeoo)
    logMessage(`Approved existing skill at '${fileURLToPath(approvedSkillUrl)}'.`)
    return 0
  }

  const candidate = await loadCandidate(config.dataDir, definition.name, digest.inputHash)
  const approvedSkillUrl = await approveCandidate(config, definition, digest, candidate)

  // TODO(HiDeoo)
  logMessage(`Approved skill written to '${fileURLToPath(approvedSkillUrl)}'.`)
  return 0
}

async function runCheckSkill(name: string, rootDir: URL): Promise<number> {
  // TODO(HiDeoo) handle never approved skill
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
  const definitionNames = new Set(definitionUrls.map(getSkillNameByDefinitionUrl))

  const reports: string[] = []
  let allCurrent = true

  for (const name of definitionNames) {
    try {
      const definitionUrl = getSkillDefinitionUrlByName(definitionUrls, name)
      const { definition, digest } = await loadSkillDefinitionInputs(config, definitionUrl)
      const issues = await getSkillIssues(config, definition, digest)

      if (issues) {
        allCurrent = false
        reports.push(`${name}: Issue\n\n${issues}`)
      } else {
        reports.push(`${name}: Ok`)
      }
    } catch (error) {
      allCurrent = false
      reports.push(`${name}: Issue\n\n${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const skillManifestUrl of await discoverSkillManifests(config.outputDir)) {
    const skillName = getSkillNameByManifestUrl(skillManifestUrl)
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
  // TODO(HiDeoo) validate names
  const config = await loadConfig(rootDir)
  const definitionUrls = await discoverSkillDefinitions(config)
  const definitionNames = new Set(definitionUrls.map(getSkillNameByDefinitionUrl))
  const orphans: { manifestUrl: URL; name: string }[] = []

  for (const manifestUrl of await discoverSkillManifests(config.outputDir)) {
    const name = getSkillNameByManifestUrl(manifestUrl)
    if (!definitionNames.has(name)) orphans.push({ manifestUrl, name })
  }

  if (orphans.length === 0) {
    logMessage('No orphan approved skills found.')
    return 0
  }

  if (!yes) {
    if (process.stdin.isTTY !== true) {
      throw new Error("Unable to confirm prune from non-interactive input. Run 'starlight-to-skills prune --yes'.")
    }

    const readline = createInterface({ input: process.stdin, output: process.stdout })

    try {
      // TODO(HiDeoo) list orphans
      const answer = await readline.question(`Prune ${orphans.length} orphan approved skills? [y/N] `)

      if (!['y', 'yes'].includes(answer.trim().toLowerCase())) {
        logMessage('Pruning cancelled.')
        return 0
      }
    } finally {
      readline.close()
    }
  }

  for (const orphan of orphans) {
    await pruneSkill(config.outputDir, orphan.name)
    logMessage(`Pruned orphan approved skill '${orphan.name}'.`)
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
): Promise<string | undefined> {
  // TODO(HiDeoo) handle never approved skill
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

  const hint = canApproveExistingSkill
    ? `\n\nIf the existing approved skill is still valid, run 'starlight-to-skills approve ${definition.name} --existing'.`
    : ''

  return `Issues:\n\n${issues.join('\n')}\n\nRun 'starlight-to-skills generate ${definition.name}' to generate a new candidate.${hint}`
}

function logMessage(message: string) {
  // eslint-disable-next-line no-console
  console.log(message)
}

function logUsageError(message: string): number {
  return logError(`${message}\n\nRun 'starlight-to-skills --help' for more information.`)
}

function logError(message: string): number {
  console.error(message)
  return 1
}

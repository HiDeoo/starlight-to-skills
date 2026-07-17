import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import packageJson from '../../package.json' with { type: 'json' }
import { ContentResultIssueLabels } from '../schemas/content'

import { approveCandidate, createCandidate, loadCandidate, removeCandidateForInput, writeCandidate } from './candidate'
import { compileSkill, generateSkillContent } from './content'
import { computeSkillDigest } from './digest'
import { loadConfig, loadSkillDefinition } from './loader'
import { discoverSkillDefinitions, getSkillDefinitionUrlByName } from './skill'
import { loadSkillDocs } from './starlight'

// TODO(HiDeoo) CLI UI
// TODO(HiDeoo) Progress/logs

const help = `Usage: starlight-to-skills <command> [options]

Commands:
  approve <name>   Approve the current candidate for a skill
  generate <name>  Generate a candidate for a skill

Options:
  -h, --help     Show help
  -v, --version  Show version`

export async function runCli(args: string[], cwd = process.cwd()): Promise<number> {
  let parsedArgs: ReturnType<typeof parseArgs>

  try {
    parsedArgs = parseArgs({
      args,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
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

  const rootDir = pathToFileURL(path.join(cwd, path.sep))

  if (command === 'generate' || command === 'approve') {
    const [name, ...extraNames] = commandArgs

    if (!name) return logUsageError(`Missing skill name for command '${command}'.`)
    if (extraNames.length > 0) return logUsageError(`Command '${command}' accepts only one skill name.`)

    try {
      return await (command === 'generate' ? generateCandidate(name, rootDir) : approveCurrentCandidate(name, rootDir))
    } catch (error) {
      return logError(error instanceof Error ? error.message : String(error))
    }
  }

  return logUsageError(`Unknown command '${command}'.`)
}

async function generateCandidate(name: string, rootDir: URL): Promise<number> {
  const { config, definition, docs, digest } = await loadSkillInputs(name, rootDir)
  const content = await generateSkillContent(config.model, definition, docs)

  if (content.status === 'error') {
    await removeCandidateForInput(config.dataDir, definition.name, digest.inputHash)
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

async function approveCurrentCandidate(name: string, rootDir: URL): Promise<number> {
  const { config, definition, digest } = await loadSkillInputs(name, rootDir)

  const candidate = await loadCandidate(config.dataDir, definition.name, digest.inputHash)
  const approvedSkillUrl = await approveCandidate(config, definition, digest, candidate)

  // TODO(HiDeoo)
  logMessage(`Approved skill written to '${fileURLToPath(approvedSkillUrl)}'.`)
  return 0
}

async function loadSkillInputs(name: string, rootDir: URL) {
  const config = await loadConfig(rootDir)
  const definitionUrls = await discoverSkillDefinitions(config)
  const definition = await loadSkillDefinition(getSkillDefinitionUrlByName(definitionUrls, name))
  const docs = await loadSkillDocs(config, definition)
  const digest = computeSkillDigest(config.model, definition, docs)

  return { config, definition, docs, digest }
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

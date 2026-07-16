import { parseArgs } from 'node:util'

import packageJson from '../../package.json' with { type: 'json' }

// TODO(HiDeoo) CLI UI

const help = `Usage: starlight-to-skills <command> [options]

Options:
  -h, --help     Show help
  -v, --version  Show version`

export function runCli(args: string[]): number {
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
    return logError(error instanceof Error ? error.message : String(error))
  }

  const [command] = parsedArgs.positionals

  if (command) return logError(`Unknown command '${command}'.`)

  if (parsedArgs.values['help']) {
    logMessage(help)
    return 0
  }

  if (parsedArgs.values['version']) {
    logMessage(packageJson.version)
    return 0
  }

  return logError('Missing command.')
}

function logMessage(message: string) {
  // eslint-disable-next-line no-console
  console.log(message)
}

function logError(message: string): number {
  console.error(`${message}\n\nRun 'starlight-to-skills --help' for more information.`)
  return 1
}

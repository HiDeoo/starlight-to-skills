import { style } from './terminal'

const commands: Record<Command, { args: string; description: string; options?: Record<string, string> }> = {
  approve: {
    args: '<skill-name> [options]',
    description: 'Approve a generated skill.',
    options: {
      '--existing': 'Confirm the approved skill remains valid.',
    },
  },
  check: {
    args: '[skill-name] [options]',
    description: 'Check whether approved skills are up to date.',
  },
  generate: {
    args: '<skill-name> [options]',
    description: 'Generate a skill for review.',
  },
  prune: {
    args: '[options]',
    description: 'Remove orphan approved skills.',
    options: {
      '-y, --yes': 'Skip the confirmation prompt.',
    },
  },
}

const help = `
  ${style.bold(`${style.primary('starlight-to-skills')} <command> [options]`)}

  ${style.section('Commands')}
  ${Object.entries(commands)
    .map(([command, { description }]) => `${command.padStart(15)}  ${style.dim(description)}`)
    .join('\n  ')}

  ${style.section('Global options')}
       -h, --help  ${style.dim('Show this help message.')}
    -v, --version  ${style.dim('Show the version number.')}`

export function getHelp(command?: string): string {
  if (!command || !Object.hasOwn(commands, command)) return help

  const { args, description, options = {} } = commands[command as Command]

  return `
  ${style.bold(`${style.primary(`starlight-to-skills ${command}`)} ${args}`)}

  ${description}

  ${style.section('Options')}
  ${Object.entries({
    ...options,
    '-h, --help': 'Show this help message.',
  })
    .map(([option, description]) => `${option.padStart(15)}  ${style.dim(description)}`)
    .join('\n  ')}`
}

type Command = 'approve' | 'check' | 'generate' | 'prune'

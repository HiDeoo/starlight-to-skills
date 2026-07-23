import { bold, dim, primary, section } from './style'

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
  ${bold(`${primary('starlight-to-skills')} <command> [options]`)}

  ${section('Commands')}
  ${Object.entries(commands)
    .map(([command, { description }]) => `${command.padStart(15)}  ${dim(description)}`)
    .join('\n  ')}

  ${section('Global options')}
       -h, --help  ${dim('Show this help message.')}
    -v, --version  ${dim('Show the version number.')}`

export function getHelp(command?: string): string {
  if (!command || !Object.hasOwn(commands, command)) return help

  const { args, description, options = {} } = commands[command as Command]

  return `
  ${bold(`${primary(`starlight-to-skills ${command}`)} ${args}`)}

  ${description}

  ${section('Options')}
  ${Object.entries({
    ...options,
    '-h, --help': 'Show this help message.',
  })
    .map(([option, description]) => `${option.padStart(15)}  ${dim(description)}`)
    .join('\n  ')}`
}

type Command = 'approve' | 'check' | 'generate' | 'prune'

import { styleText } from 'node:util'

import { bold, dim, primary } from './style'

const help = `
  ${bold(`${primary('starlight-to-skills')} <command> [options]`)}

  ${section('Commands')}
          approve  ${dim('Approve a generated skill.')}
            check  ${dim('Check whether approved skills are up to date.')}
         generate  ${dim('Generate a skill for review.')}
            prune  ${dim('Remove orphan approved skills.')}

  ${section('Global options')}
       -h, --help  ${dim('Show this help message.')}
    -v, --version  ${dim('Show the version number.')}`

// TODO(HiDeoo) Include command description
// TODO(HiDeoo) typecheck everything based on commands using a union or somethjing.
const commandHelp: Record<string, string> = {
  approve: `
  ${bold(`${primary('starlight-to-skills approve')} <name> [options]`)}

  ${section('Options')}
       --existing  ${dim('Confirm the approved skill remains valid.')}
       -h, --help  ${dim('Show this help message.')}`,
  check: `
  ${bold(`${primary('starlight-to-skills check')} [name] [options]`)}

  ${section('Options')}
       -h, --help  ${dim('Show this help message.')}`,
  generate: `
  ${bold(`${primary('starlight-to-skills generate')} <name> [options]`)}

  ${section('Options')}
       -h, --help  ${dim('Show this help message.')}`,
  prune: `
  ${bold(`${primary('starlight-to-skills prune')} [options]`)}

  ${section('Options')}
        -y, --yes  ${dim('Skip the confirmation prompt.')}
       -h, --help  ${dim('Show this help message.')}`,
}

export function getHelp(command?: string): string {
  if (!command || !Object.hasOwn(commandHelp, command)) return help
  return commandHelp[command] ?? help
}

function section(title: string) {
  return styleText(['bgWhite', 'black'], ` ${title} `)
}

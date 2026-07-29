import type { StarlightPlugin } from '@astrojs/starlight/types'

import { checkSkills } from './libs/check'
import { formatError } from './libs/terminal'

export default function starlightToSkills(): StarlightPlugin {
  return {
    name: 'starlight-to-skills',
    hooks: {
      async 'config:setup'({ astroConfig, command, logger }) {
        if (command !== 'dev' && command !== 'build') return

        if (command === 'build') {
          try {
            logger.info(await checkSkills(astroConfig.root))
          } catch (error) {
            logger.error(`${formatError(error)}\n`)

            const buildError = new Error('See the Starlight to Skills error report above.')
            // We omit the stack trace as the actionable error report is already logged above.
            delete buildError.stack
            throw buildError
          }
        }
      },
    },
  }
}

import { fileURLToPath } from 'node:url'

import type { StarlightPlugin } from '@astrojs/starlight/types'
import { AstroError } from 'astro/errors'

import { checkSkills } from './libs/check'
import { DiscoveryArchiveRoutePattern, DiscoveryIndexRoutePattern, DiscoveryPath } from './libs/discovery'
import { pathExists } from './libs/fs'
import { formatError } from './libs/terminal'

// FIXME(HiDeoo) fix color? underline? Something else?

export default function starlightToSkills(): StarlightPlugin {
  return {
    name: 'starlight-to-skills',
    hooks: {
      async 'config:setup'({ addIntegration, astroConfig, command, logger }) {
        if (command !== 'dev' && command !== 'build') return

        if (astroConfig.base !== '/') {
          throw new AstroError(
            `Starlight to Skills requires Astro's \`base\` option to be '/' but received '${astroConfig.base}'.`,
            `Agent Skills Discovery must be served at the origin-root path '/${DiscoveryPath}/'.`,
          )
        }

        if (command === 'build') {
          const discoveryDir = new URL(DiscoveryPath, astroConfig.publicDir)

          if (await pathExists(discoveryDir)) {
            throw new AstroError(
              `Starlight to Skills cannot overwrite '${fileURLToPath(discoveryDir)}'.`,
              'Move or remove the existing file or directory and build the project again.',
            )
          }

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

        addIntegration({
          name: 'starlight-to-skills',
          hooks: {
            'astro:config:setup'({ injectRoute }) {
              injectRoute({
                pattern: DiscoveryIndexRoutePattern,
                entrypoint: 'starlight-to-skills/routes',
                prerender: true,
              })

              injectRoute({
                pattern: DiscoveryArchiveRoutePattern,
                entrypoint: 'starlight-to-skills/routes',
                prerender: true,
              })
            },
          },
        })
      },
    },
  }
}

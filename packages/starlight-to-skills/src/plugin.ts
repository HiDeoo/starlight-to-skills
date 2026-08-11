import { fileURLToPath } from 'node:url'

import type { StarlightPlugin } from '@astrojs/starlight/types'
import { AstroError } from 'astro/errors'

import { checkSkills } from './libs/check'
import { DiscoveryArchiveRoutePattern, DiscoveryIndexRoutePattern, DiscoveryPath } from './libs/discovery'
import { pathExists } from './libs/fs'
import { loadConfig } from './libs/loader'
import { formatError } from './libs/terminal'
import { vitePluginStarlightToSkills } from './libs/vite'
import { Translations } from './translations'

export default function starlightToSkills(): StarlightPlugin {
  return {
    name: 'starlight-to-skills',
    hooks: {
      'i18n:setup'({ injectTranslations }) {
        injectTranslations(Translations)
      },
      async 'config:setup'({ addIntegration, astroConfig, command, config: starlightConfig, logger }) {
        if (command !== 'dev' && command !== 'build') return

        if (astroConfig.base !== '/') {
          throw new AstroError(
            `Starlight to Skills requires Astro's \`base\` option to be '/' but received '${astroConfig.base}'.`,
            `Agent Skills Discovery must be served at the origin-root path '/${DiscoveryPath}/'.`,
          )
        }

        const { catalog } = await loadConfig(astroConfig.root)

        if (catalog && !astroConfig.site) {
          throw new AstroError(
            "Starlight to Skills requires Astro's `site` option to be defined when the catalog option is configured.",
            "Configure Astro's `site` option or set `catalog` to `false`.",
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
            'astro:config:setup'({ config: astroConfig, injectRoute, updateConfig }) {
              injectRoute({
                pattern: DiscoveryIndexRoutePattern,
                entrypoint: 'starlight-to-skills/routes/discovery',
                prerender: true,
              })

              injectRoute({
                pattern: DiscoveryArchiveRoutePattern,
                entrypoint: 'starlight-to-skills/routes/discovery',
                prerender: true,
              })

              const skillsCatalog = catalog ?? (astroConfig.site ? { path: 'skills' } : false)

              if (skillsCatalog && astroConfig.i18n && astroConfig.i18n.routing !== 'manual') {
                for (const locale of astroConfig.i18n.locales) {
                  const localePath = typeof locale === 'string' ? locale : locale.path

                  injectRoute({
                    pattern:
                      localePath === astroConfig.i18n.defaultLocale && !astroConfig.i18n.routing.prefixDefaultLocale
                        ? skillsCatalog.path
                        : `${localePath}/${skillsCatalog.path}`,
                    entrypoint: 'starlight-to-skills/routes/catalog',
                    prerender: true,
                  })
                }
              }

              updateConfig({ vite: { plugins: [vitePluginStarlightToSkills(astroConfig, starlightConfig)] } })
            },
          },
        })
      },
    },
  }
}

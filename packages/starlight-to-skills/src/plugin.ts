import type { StarlightPlugin } from '@astrojs/starlight/types'

export default function starlightToSkills(): StarlightPlugin {
  return {
    name: 'starlight-to-skills',
    hooks: {
      'config:setup'({ logger }) {
        logger.info('Hello from Starlight plugin.')
      },
    },
  }
}

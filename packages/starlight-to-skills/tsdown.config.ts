import { defineConfig } from 'tsdown'

const deps = {
  neverBundle: ['astro', 'astro:config/server'],
}

export default defineConfig([
  { deps, dts: false, entry: ['src/cli.ts', 'src/routes.ts'] },
  { deps, dts: true, entry: ['src/config.ts', 'src/plugin.ts', 'src/skill.ts'] },
])

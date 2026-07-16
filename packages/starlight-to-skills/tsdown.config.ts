import { defineConfig } from 'tsdown'

const deps = {
  neverBundle: ['astro/zod'],
}

export default defineConfig([
  { deps, dts: false, entry: ['src/cli.ts'] },
  { deps, dts: true, entry: ['src/config.ts', 'src/skill.ts'] },
])

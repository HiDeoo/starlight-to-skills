import { defineConfig } from 'tsdown'

const deps = {
  neverBundle: ['astro', 'virtual:starlight-to-skills/skills'],
}

export default defineConfig([
  {
    copy: [
      { from: 'src/components/*.astro', to: 'dist/components' },
      { from: 'src/user-components/*.astro', to: 'dist/user-components' },
      { from: 'src/routes/catalog.astro', to: 'dist/routes' },
    ],
    deps,
    dts: false,
    entry: ['src/cli.ts', 'src/routes/discovery.ts'],
  },
  {
    deps,
    dts: true,
    entry: ['src/config.ts', 'src/plugin.ts', 'src/skill.ts'],
  },
])

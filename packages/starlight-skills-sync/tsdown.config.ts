import { defineConfig } from 'tsdown'

export default defineConfig({
  deps: {
    neverBundle: ['astro/zod'],
  },
  dts: true,
  entry: 'src/config.ts',
})

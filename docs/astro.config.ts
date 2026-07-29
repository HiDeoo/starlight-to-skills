import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import starlightToSkills from 'starlight-to-skills'

const site =
  (process.env['CONTEXT'] === 'production' ? process.env['URL'] : process.env['DEPLOY_PRIME_URL']) ??
  'https://starlight-to-skills.netlify.app/'

export default defineConfig({
  integrations: [
    starlight({
      description: '// TODO(HiDeoo) ',
      editLink: {
        baseUrl: 'https://github.com/HiDeoo/starlight-to-skills/edit/main/docs/',
      },
      head: [
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: new URL('og.jpg', site).href,
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image:alt',
            content: '// TODO(HiDeoo) ',
          },
        },
      ],
      plugins: [starlightToSkills()],
      sidebar: [
        {
          label: 'Start Here',
          // TODO(HiDeoo)
          items: [],
          // items: ["getting-started", "configuration"],
        },
        {
          label: 'Guides',
          // TODO(HiDeoo)
          items: [],
          // items: ["guides/custom-highlights"],
        },
        {
          label: 'Resources',
          // TODO(HiDeoo)
          items: [],
          // items: [{ label: "Plugins and Tools", slug: "resources/starlight" }],
        },
      ],
      social: [
        {
          href: 'https://bsky.app/profile/hideoo.dev',
          icon: 'blueSky',
          label: 'Bluesky',
        },
        {
          href: 'https://github.com/HiDeoo/starlight-to-skills',
          icon: 'github',
          label: 'GitHub',
        },
      ],
      title: 'Starlight to Skills',
    }),
  ],
  site,
  trailingSlash: 'always',
})

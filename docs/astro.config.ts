import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import starlightToSkills from 'starlight-to-skills'

const site =
  (process.env['CONTEXT'] === 'production' ? process.env['URL'] : process.env['DEPLOY_PRIME_URL']) ??
  'https://starlight-to-skills.netlify.app/'

export default defineConfig({
  integrations: [
    starlight({
      components: {
        Hero: './src/components/Hero.astro',
        PageTitle: './src/components/PageTitle.astro',
      },
      description: 'Turn Starlight documentation pages into reviewed, discoverable, and up-to-date agent skills.',
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
            content: 'Turn Starlight documentation pages into reviewed, discoverable, and up-to-date agent skills.',
          },
        },
      ],
      plugins: [starlightToSkills()],
      sidebar: [
        {
          label: 'Start Here',
          items: ['getting-started', 'configuration', 'skill-definition'],
        },
        {
          label: 'Commands',
          items: [{ autogenerate: { directory: 'commands' } }],
        },
        {
          label: 'Components',
          items: [{ autogenerate: { directory: 'components' } }],
        },
        {
          label: 'Guides',
          items: ['guides/i18n'],
        },
        {
          label: 'Resources',
          items: [{ label: 'Plugins and Tools', slug: 'resources/starlight' }],
        },
        {
          label: 'Demo',
          items: [{ label: 'Skills', link: '/skills/' }],
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

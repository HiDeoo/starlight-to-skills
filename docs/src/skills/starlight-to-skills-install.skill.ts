import { defineSkill } from 'starlight-to-skills/skill'

export default defineSkill({
  description:
    'Install and configure Starlight to Skills in an existing Astro Starlight project. ' +
    'Use when asked to add, install, configure, or initialize the starlight-to-skills package and plugin.',
  docs: ['./getting-started.mdx'],
  guidance:
    'Cover only installation and initial configuration but exclude skill creation and management. ' +
    "Mention that the package manager should be inferred from the user's project and only show an example using `npm`. " +
    "Mention that if Astro's `site` value is not configured, ask the user to provide it or confirm it should be omitted. " +
    'End with a reminder to replace the example model and link to https://starlight-to-skills.netlify.app/configuration/#model',
})

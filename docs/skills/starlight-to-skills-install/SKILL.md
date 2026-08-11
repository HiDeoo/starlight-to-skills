---
name: "starlight-to-skills-install"
description: "Install and configure Starlight to Skills in an existing Astro Starlight project. Use when asked to add, install, configure, or initialize the starlight-to-skills package and plugin."
---

# Install and configure Starlight to Skills

1. Confirm that the project is an existing Astro Starlight site. Starlight to Skills requires Starlight to be set up first.

2. Infer the package manager from the project’s existing files and conventions. Install `starlight-to-skills` with that package manager. For an npm project:

   ```sh
   npm install starlight-to-skills
   ```

3. Add the plugin to `astro.config.mjs`:

   ```js
   // astro.config.mjs
   import starlight from '@astrojs/starlight'
   import { defineConfig } from 'astro/config'
   import starlightToSkills from 'starlight-to-skills'

   export default defineConfig({
     integrations: [
       starlight({
         plugins: [starlightToSkills()],
         title: 'My Docs',
       }),
     ],
   })
   ```

4. Create `starlight-to-skills.config.ts` at the project root. Configure the provider and model used to generate skills through Mastra:

   ```ts
   // starlight-to-skills.config.ts
   import { defineConfig } from 'starlight-to-skills/config'

   export default defineConfig({
     model: 'openai/gpt-5.6-luna',
   })
   ```

   Use a provider and model supported by Mastra.

5. Add the plugin’s temporary directory to version control exclusions:

   ```gitignore
   .starlight-to-skills/
   ```

   Keep approved skills committed.

6. Check Astro’s `site` option in `astro.config.mjs`. Set it to the deployed URL when available:

   ```js
   export default defineConfig({
     site: 'https://example.com',
     integrations: [
       starlight({
         // ...
       }),
     ],
   })
   ```

   The `site` value is required for the catalog page and the `<SkillCallout>` component. If `site` is not configured, ask the user to provide the deployed URL or confirm that it should be omitted; do not invent a URL.

Before completing the setup, remind the user to replace the example model and refer to the [model configuration documentation](https://starlight-to-skills.netlify.app/configuration/#model).
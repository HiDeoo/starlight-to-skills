---
title: Configuration
description: An overview of all the configuration options supported by the Starlight to Skills plugin.
---

Starlight to Skills can be configured inside the `starlight-to-skills.config.ts` configuration file at the root of your Starlight project:

```js {5}
// starlight-to-skills.config.ts
import { defineConfig } from 'starlight-to-skills/config'

export default defineConfig({
  // Configuration options go here.
})
```

## Configuration options

Starlight to Skills accepts the following configuration options:

### `model`

**Required**  
**Type:** `string`

The provider and model to use for generating skills

Starlight to Skills uses [Mastra](https://mastra.ai/) under the hood to call the model and generate the skill content.
A list of all supported providers and models can be found in the [Mastra documentation](https://mastra.ai/models/providers).

```ts
defineConfig({
  // Use the `gpt-5.6-sol` model from the `openai` provider.
  model: 'openai/gpt-5.6-sol',
})
```

### `definitionsDir`

**Type:** `string`  
**Default:** `'./src/skills'`

The directory relative to the project root containing the [skill definition files](/skill-definition/) to use for generating skills.
Starlight to Skills only loads files with a `.skill.ts` extension that are in the specified directory and does not search nested directories.

```ts
defineConfig({
  // Look for skill definition files in the `src/skill-definitions/` directory.
  definitionsDir: './src/skill-definitions',
})
```

### `outputDir`

**Type:** `string`  
**Default:** `'./skills'`

The directory relative to the project root where approved skills will be written.

```ts
defineConfig({
  // Write approved skills to the `.agents/skills/` directory.
  outputDir: './.agents/skills',
})
```

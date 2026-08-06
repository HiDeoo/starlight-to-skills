---
title: Skill definition
description: An overview of all the skill definition options supported by the Starlight to Skills plugin.
---

Define each skill in a TypeScript file with a `.skill.ts` extension in the `src/skills/` directory relative to the project root.

The filename determines the skill name: `example.skill.ts` defines a skill named `example`.
Skill names must contain 1–64 lowercase letters, numbers, or hyphens, without leading, trailing, or consecutive hyphens.

```js {5}
// src/skills/example.skill.ts
import { defineSkill } from 'starlight-to-skills/skill'

export default defineSkill({
  // Skill definition options go here.
})
```

The directory containing the skill definition files can be configured using the [`definitionsDir` configuration option](/configuration/#definitionsdir).

## Definition options

Skill definitions accept the following options:

### `description`

**Required**  
**Type:** `string`

The [description](https://agentskills.io/specification#description-field) of the skill, which should describe what the skill does, when to use it, and include specific keywords that help agents identify relevant tasks.

```ts
defineSkill({
  // A description of the skill explaining what it does and when to use it.
  description:
    'Upgrade projects from package v2 to v3, including required dependency, ' +
    'configuration, and API changes. Use when planning, performing, reviewing, ' +
    'or troubleshooting the migration.',
})
```

### `docs`

**Required**  
**Type:** `string[]`

Paths to the Starlight documentation pages that contain the knowledge needed for the skill.
The paths are relative to the `src/content/docs/` directory.

```ts
defineSkill({
  // ./src/content/docs/upgrade.mdx
  // ./src/content/docs/guides/upgrade-to/v3.mdx
  docs: ['./upgrade.mdx', './guides/upgrade-to/v3.mdx'],
})
```

### `guidance`

**Type:** `string`

Additional context and instructions to use when generating the skill.

```ts
defineSkill({
  // Additional instructions for skill generation.
  guidance: 'List any in-use features no longer supported in v3.',
})
```

### `license`

**Type:** `string`

The [license](https://agentskills.io/specification#license-field) of the skill.

```ts
defineSkill({
  // The license for the skill.
  license: 'MIT',
})
```

### `compatibility`

**Type:** `string`

Specific [compatibility](https://agentskills.io/specification#compatibility-field) requirements for the skill.
As mentioned in the [Agent Skills specification](https://agentskills.io/specification#compatibility-field), most skills do not need this option.

```ts
defineSkill({
  // The compatibility requirements for the skill.
  compatibility: 'Requires Node.js v24 or later.',
})
```

### `metadata`

**Type:** `Record<string, string>`

Additional [metadata](https://agentskills.io/specification#metadata-field) for the skill.

```ts
defineSkill({
  // The metadata for the skill.
  metadata: {
    author: 'HiDeoo',
  },
})
```

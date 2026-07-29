import { describe, expect, test } from 'vitest'

import { loadSkillDocs } from '../src/libs/starlight'

const config = { rootDir: new URL('fixtures/project/', import.meta.url) }

describe('loadSkillDocs', () => {
  test('loads selected documentation in authored order', async () => {
    const skill = { docs: ['getting-started.mdx', './guides/custom-thing.md', './guides/toml.md'] }

    const docs = await loadSkillDocs(config, skill)

    expect(docs.map((doc) => doc.title)).toMatchInlineSnapshot(`
      [
        "Getting started",
        "Custom Thing",
        "TOML Guide",
      ]
    `)

    expect(docs.map((doc) => doc.body)).toMatchInlineSnapshot(`
      [
        "
      ## Getting Started

      This is a fixture page for the getting started guide.
      ",
        "
      ## Custom Thing

      This is a fixture page for a custom thing.
      ",
        "
      ## TOML Guide

      This is a fixture page for the TOML guide.
      ",
      ]
    `)
  })

  test('rejects an unknown documentation file', async () => {
    const skill = { docs: ['./unknown.md'] }

    await expect(loadSkillDocs(config, skill)).rejects.toMatchObject({
      message: "Failed to load documentation file './unknown.md'.",
      hint: 'Check the path in the skill definition and try again.',
    })
  })

  test.for(['../outside.md', '/outside.md'])(
    'rejects documentation file path %j outside of Starlight docs collection',
    async (docPath) => {
      const skill = { docs: [docPath] }

      await expect(loadSkillDocs(config, skill)).rejects.toMatchObject({
        message: `Documentation file '${docPath}' must be inside 'src/content/docs/'.`,
        hint: "Use a path relative to 'src/content/docs/'.",
      })
    },
  )

  test('rejects a documentation file that is not a file', async () => {
    const skill = { docs: ['./directory.md'] }

    await expect(loadSkillDocs(config, skill)).rejects.toMatchObject({
      message: "Documentation path './directory.md' is not a file.",
      hint: 'Specify a Markdown or MDX file in the skill definition and try again.',
    })
  })

  test('rejects a documentation file with an invalid frontmatter', async () => {
    const skill = { docs: ['./invalid-frontmatter.md'] }

    await expect(loadSkillDocs(config, skill)).rejects.toMatchObject({
      message: "Documentation file './invalid-frontmatter.md' has an invalid title.",
      hint: "Fix 'title' in the file's frontmatter and try again.",
    })
  })
})

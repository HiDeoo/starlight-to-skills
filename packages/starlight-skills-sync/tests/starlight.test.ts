import { describe, expect, test } from 'vitest'

import type { StarlightSkillsSyncConfig } from '../src/config'
import { loadSkillDocs } from '../src/libs/starlight'
import type { SkillDefinition } from '../src/skill'

const rootDir = new URL('fixtures/project/', import.meta.url)
const config = { rootDir } as StarlightSkillsSyncConfig

describe('loadSkillDocs', () => {
  test('loads selected documentation in authored order', async () => {
    const skill = { docs: ['getting-started.mdx', './guides/custom-thing.md', './guides/toml.md'] } as SkillDefinition

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

  test('rejects an unknown documentation source', async () => {
    const skill = { docs: ['./unknown.md'] } as SkillDefinition

    await expect(loadSkillDocs(config, skill)).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Failed to load documentation source './unknown.md'.]`,
    )
  })

  test('rejects a documentation source that is not a file', async () => {
    const skill = { docs: ['./directory.md'] } as SkillDefinition

    await expect(loadSkillDocs(config, skill)).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Documentation source './directory.md' is not a file.]`,
    )
  })

  test('rejects a documentation source with an invalid frontmatter', async () => {
    const skill = { docs: ['./invalid-frontmatter.md'] } as SkillDefinition

    await expect(loadSkillDocs(config, skill)).rejects.toThrowErrorMatchingInlineSnapshot(
      `[TypeError: Documentation source './invalid-frontmatter.md' must have a valid 'title' frontmatter property.]`,
    )
  })
})

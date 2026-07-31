import { beforeEach, describe, expect, test, vi } from 'vitest'

import { compileSkill, generateSkillContent, type SkillUpdate } from '../src/libs/content'
import type { SkillConfiguration } from '../src/libs/loader'
import type { SkillDocumentation } from '../src/libs/starlight'

const mastra = vi.hoisted(() => ({
  constructAgent: vi.fn(),
  generate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    constructor(options: unknown) {
      mastra.constructAgent(options)
    }
    generate(...args: unknown[]) {
      return mastra.generate(...args)
    }
  },
}))

const skill: SkillConfiguration = {
  name: 'migrate-to-v2',
  description: 'Migrate a project to v2.',
  docs: ['./guides/migrate-v2.md', './changelog.md'],
  guidance: 'Write the generated skill in French.',
  license: 'MIT',
  url: new URL('file:///project/src/skills/migrate-to-v2.skill.ts'),
}

const docs: SkillDocumentation[] = [
  {
    path: './guides/migrate-v2.md',
    title: 'V2 Migration Guide',
    body: 'Change foo to bar.\n\nThen change baz to quux.',
  },
  {
    path: './changelog.md',
    title: 'Changelog',
    body: '# Changelog\n\n## v2.0.0\n\n- Added new features.',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateSkillContent', () => {
  test('generates skill content using defined inputs', async () => {
    const content = {
      status: 'success',
      body: 'Changez foo en bar, puis changez bar en baz.',
      references: [{ path: 'references/migration-details.md', body: 'Change foo to bar.' }],
    }

    mastra.generate.mockResolvedValue({ object: { data: content } })

    const result = await generateSkillContent('openai/gpt-5.6-luna', skill, docs)

    const [{ instructions, model }] = mastra.constructAgent.mock.calls[0] as [Record<string, unknown>]

    expect(mastra.constructAgent).toHaveBeenCalledOnce()
    expect(instructions).toMatch(/^Generate content for an agent skill/)
    expect(instructions).not.toContain('# Updating an approved skill')
    expect(model).toBe('openai/gpt-5.6-luna')

    expect(mastra.generate).toHaveBeenCalledOnce()

    const [prompt] = mastra.generate.mock.calls[0] as [string]

    const input = JSON.parse(prompt) as Record<string, unknown>

    expect(input).toMatchObject({
      name: skill.name,
      description: skill.description,
      guidance: skill.guidance,
      docs,
    })
    expect(input).not.toHaveProperty('license')

    expect(input).not.toHaveProperty('update')

    expect(result).toStrictEqual(content)
  })

  test('uses an approved skill for updates', async () => {
    const content = {
      status: 'success',
      body: 'Change foo to bar, then change bar to baz.',
      references: [{ path: 'references/migration-details.md', body: 'Change foo to bar.' }],
    }
    const update: SkillUpdate = {
      approvedFiles: [
        { path: 'SKILL.md', content: '---\nname: "migrate-to-v2"\n---\n\nChange foo to bar.' },
        { path: 'references/migration-details.md', content: 'Change foo to bar.' },
      ],
      changedDocPaths: ['./guides/migrate-v2.md'],
    }

    mastra.generate.mockResolvedValue({ object: { data: content } })

    await generateSkillContent('openai/gpt-5.6-luna', skill, docs, update)

    const [{ instructions }] = mastra.constructAgent.mock.calls[0] as [{ instructions: string }]

    expect(instructions).toContain('# Updating an approved skill')

    const [prompt] = mastra.generate.mock.calls[0] as [string]

    expect(JSON.parse(prompt)).toMatchObject({ update })
  })

  test('returns generation issues', async () => {
    const content = {
      status: 'error',
      issues: [
        {
          type: 'missing-information',
          docPaths: ['./guides/migrate-v2.md'],
          details: 'The documentation file is missing required information.',
        },
      ],
    }

    mastra.generate.mockResolvedValue({ object: { data: content } })

    await expect(generateSkillContent('openai/gpt-5.6-luna', skill, docs)).resolves.toStrictEqual(content)
  })

  test('rejects model failures', async () => {
    mastra.generate.mockRejectedValue(new Error('Request failed.'))

    await expect(generateSkillContent('openai/gpt-5.6-luna', skill, docs)).rejects.toThrowErrorMatchingInlineSnapshot(`
      Model 'openai/gpt-5.6-luna' failed to generate 'migrate-to-v2'.

      Request failed.
    `)
  })

  test('rejects invalid model output', async () => {
    mastra.generate.mockResolvedValue({ object: { result: { status: 'success' } } })

    await expect(generateSkillContent('openai/gpt-5.6-luna', skill, docs)).rejects.toMatchInlineSnapshot(`
      Model 'openai/gpt-5.6-luna' returned an invalid response.

      Hint: Run 'pnpm exec starlight-to-skills generate migrate-to-v2' again.
    `)
  })

  test('rejects invalid reference paths', async () => {
    mastra.generate.mockResolvedValue({
      object: {
        data: {
          status: 'success',
          body: 'Change foo to bar.',
          references: [{ path: '../outside.md', body: 'Outside content.' }],
        },
      },
    })

    await expect(generateSkillContent('openai/gpt-5.6-luna', skill, docs)).rejects.toMatchInlineSnapshot(`
      Model 'openai/gpt-5.6-luna' returned an invalid response.

      Hint: Run 'pnpm exec starlight-to-skills generate migrate-to-v2' again.
    `)
  })
})

describe('compileSkill', () => {
  test('compiles a skill', () => {
    const files = compileSkill(skill, {
      status: 'success',
      body: 'Change foo to bar.',
      references: [
        { path: 'references/first.md', body: 'First reference.' },
        { path: 'references/second.md', body: 'Second reference.' },
      ],
    })

    expect(files).toMatchInlineSnapshot(`
      [
        {
          "content": "---
      name: "migrate-to-v2"
      description: "Migrate a project to v2."
      license: "MIT"
      ---

      Change foo to bar.",
          "path": "SKILL.md",
        },
        {
          "content": "First reference.",
          "path": "references/first.md",
        },
        {
          "content": "Second reference.",
          "path": "references/second.md",
        },
      ]
    `)
  })
})

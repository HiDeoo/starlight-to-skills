import fs from 'node:fs/promises'
import { Readable } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import { gunzipSync } from 'node:zlib'

import type { APIContext } from 'astro'
import tar from 'tar-stream'
import { expect, vi } from 'vitest'

import { DiscoveryArchiveRoutePattern, DiscoveryIndexRoutePattern, makeDiscoveryRoute } from '../src/libs/discovery'

import { test, type TestProject } from './project'

const logger: APIContext['logger'] = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }

let project: TestProject

test.beforeEach(({ project: testProject }) => {
  project = testProject
})

test('serves discovery index and valid skills', async () => {
  await addApprovedSkill('foo', [
    { path: 'SKILL.md', content: 'Foo.' },
    { path: 'references/details.md', content: 'Reference content.' },
  ])
  await addApprovedSkill('bar', [{ path: 'SKILL.md', content: 'Bar.' }])
  await addApprovedSkill('baz', [{ path: 'SKILL.md', content: 'Baz.' }])
  await addApprovedSkill('qux', [{ path: 'SKILL.md', content: 'Qux.' }])

  await addSkillInputs('quux')

  await project.append('src/content/docs/baz.md', '\nUpdated documentaion file.')
  await project.write('skills/qux/SKILL.md', 'Edited skill content.')

  const route = makeDiscoveryRoute(project.rootDir, true)
  const indexPaths = await route.getStaticPaths({ routePattern: DiscoveryIndexRoutePattern })
  const archivePaths = await route.getStaticPaths({ routePattern: DiscoveryArchiveRoutePattern })

  expect(indexPaths).toMatchInlineSnapshot(`
    [
      {
        "params": {
          "file": "index",
        },
      },
    ]
  `)

  expect(archivePaths).toMatchInlineSnapshot(`
    [
      {
        "params": {
          "skill": "bar",
        },
      },
      {
        "params": {
          "skill": "foo",
        },
      },
    ]
  `)

  const fooResponse = await getDiscoveryResponse(route, { skill: 'foo' })
  const fooBytes = Buffer.from(await fooResponse.arrayBuffer())

  expect(fooResponse.headers.get('Content-Type')).toBe('application/gzip')

  await expect(getArchiveContent(fooBytes)).resolves.toMatchInlineSnapshot(`
    {
      "SKILL.md": "Foo.",
      "references/details.md": "Reference content.",
    }
  `)

  const indexResponse = await getDiscoveryResponse(route, { file: 'index' })

  expect(indexResponse.headers.get('Content-Type')).toBe('application/json')

  await expect(indexResponse.json()).resolves.toMatchInlineSnapshot(`
    {
      "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
      "skills": [
        {
          "description": "Use bar.",
          "digest": "sha256:92537080fd10fd847741b4499704b027d81e4842f85144544c06624f8fa50dae",
          "name": "bar",
          "type": "archive",
          "url": "/.well-known/agent-skills/bar.tar.gz",
        },
        {
          "description": "Use foo.",
          "digest": "sha256:3a6490916391dd1f527dfdbd4f3fe9620e96d5b1427d0d60fb3bd91e4ce190a3",
          "name": "foo",
          "type": "archive",
          "url": "/.well-known/agent-skills/foo.tar.gz",
        },
      ],
    }
  `)

  await expect(getDiscoveryResponse(route, { skill: 'missing' })).resolves.toMatchObject({ status: 404 })
})

test('does not serve discovery index with no skills', async () => {
  await addSkillInputs('foo')

  const route = makeDiscoveryRoute(project.rootDir, false)

  await expect(route.getStaticPaths({ routePattern: DiscoveryIndexRoutePattern })).resolves.toStrictEqual([])
  await expect(route.getStaticPaths({ routePattern: DiscoveryArchiveRoutePattern })).resolves.toStrictEqual([])
})

test('does not serve duplicate skill definitions', async () => {
  await project.write(
    'starlight-to-skills.config.ts',
    `export default { model: 'openai/gpt-5.6-luna', definitions: './src/skills/*/*.skill.ts' }`,
  )

  await fs.mkdir(project.path('src/skills/first'))
  await fs.mkdir(project.path('src/skills/second'))

  await addSkillInputs('foo')
  await fs.rename(project.path('src/skills/foo.skill.ts'), project.path('src/skills/first/foo.skill.ts'))
  await project.approveSkill('foo', [{ path: 'SKILL.md', content: 'Foo.' }])

  await addSkillInputs('duplicate')

  const definitionPath = project.path('src/skills/duplicate.skill.ts')

  await fs.rename(definitionPath, project.path('src/skills/first/duplicate.skill.ts'))

  await project.approveSkill('duplicate', [{ path: 'SKILL.md', content: 'Duplicate.' }])

  await fs.copyFile(
    project.path('src/skills/first/duplicate.skill.ts'),
    project.path('src/skills/second/duplicate.skill.ts'),
  )

  const route = makeDiscoveryRoute(project.rootDir, false)

  await expect(route.getStaticPaths({ routePattern: DiscoveryArchiveRoutePattern })).resolves.toMatchInlineSnapshot(`
    [
      {
        "params": {
          "skill": "foo",
        },
      },
    ]
  `)

  const indexResponse = await getDiscoveryResponse(route, { file: 'index' })

  await expect(indexResponse.json()).resolves.toMatchInlineSnapshot(`
    {
      "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
      "skills": [
        {
          "description": "Use foo.",
          "digest": "sha256:04930c26107e32b96d509da2a4c1057c328a5c51ea61fb7b1cd4669273040832",
          "name": "foo",
          "type": "archive",
          "url": "/.well-known/agent-skills/foo.tar.gz",
        },
      ],
    }
  `)
})

test('serves identical archive digests for identical skill content', async () => {
  await addApprovedSkill('test', [
    { path: 'SKILL.md', content: 'Skill content.' },
    { path: 'references/details.md', content: 'Reference content.' },
  ])

  const firstRoute = makeDiscoveryRoute(project.rootDir, false)
  const secondRoute = makeDiscoveryRoute(project.rootDir, false)

  const firstIndexResponse = await getDiscoveryResponse(firstRoute, { file: 'index' })
  const secondIndexResponse = await getDiscoveryResponse(secondRoute, { file: 'index' })

  expect(await firstIndexResponse.json()).toStrictEqual(await secondIndexResponse.json())
})

test('does not serve extra files from approved skills', async () => {
  await addApprovedSkill('foo', [{ path: 'SKILL.md', content: 'Foo.' }])

  await project.write('skills/foo/extra.md', 'Extra content.')

  const route = makeDiscoveryRoute(project.rootDir, false)

  const response = await getDiscoveryResponse(route, { skill: 'foo' })
  const bytes = Buffer.from(await response.arrayBuffer())

  await expect(getArchiveContent(bytes)).resolves.toStrictEqual({
    'SKILL.md': 'Foo.',
  })
})

test('rejects a file updated after discovery', async () => {
  await addApprovedSkill('foo', [{ path: 'SKILL.md', content: 'Foo.' }])

  const route = makeDiscoveryRoute(project.rootDir, false)

  await route.getStaticPaths({ routePattern: DiscoveryArchiveRoutePattern })

  await project.write('skills/foo/SKILL.md', 'Updateed skill content.')

  await expect(getDiscoveryResponse(route, { skill: 'foo' })).rejects.toMatchInlineSnapshot(
    `Skill 'foo' is not up to date.`,
  )
})

function getDiscoveryResponse(route: ReturnType<typeof makeDiscoveryRoute>, params: APIContext['params']) {
  return route.GET({ params, logger })
}

async function addSkillInputs(name: string) {
  await project.write(
    `src/skills/${name}.skill.ts`,
    `export default { description: 'Use ${name}.', docs: ['./${name}.md'] }`,
  )
  await project.write(
    `src/content/docs/${name}.md`,
    `---
title: ${name}
---

# ${name}`,
  )
}

async function addApprovedSkill(name: string, files: TestFile[]) {
  await addSkillInputs(name)
  await project.approveSkill(name, files)
}

async function getArchiveContent(bytes: Buffer): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  const extract = tar.extract()

  Readable.from([gunzipSync(bytes)]).pipe(extract)

  for await (const entry of extract) {
    const content = await buffer(entry)
    files[entry.header.name] = content.toString()
  }

  return files
}

interface TestFile {
  path: string
  content: string
}

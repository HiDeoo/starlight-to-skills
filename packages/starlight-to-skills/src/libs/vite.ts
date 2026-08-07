import type { StarlightConfig, StarlightUserConfig } from '@astrojs/starlight/types'
import type { AstroConfig, ViteUserConfig } from 'astro'

import { getDiscoverableSkills } from './discovery'

export function vitePluginStarlightToSkills(
  astroConfig: Pick<AstroConfig, 'root'>,
  starlightConfig: Pick<StarlightUserConfig, 'markdown'>,
): VitePlugin {
  const context: StarlightToSkillsContext = {
    headingLinks: starlightConfig.markdown?.headingLinks ?? true,
  }

  let skillsPromise: ReturnType<typeof getDiscoverableSkills> | undefined

  const modules = {
    'virtual:starlight-to-skills/context': () => `export default ${JSON.stringify(context)}`,
    'virtual:starlight-to-skills/skills': async () => {
      const skills = await (skillsPromise ??= getDiscoverableSkills(astroConfig.root))

      return `const skills = ${JSON.stringify(skills)}
for (const skill of skills.skills) skill.directory = new URL(skill.directory)

export default skills`
    },
  }

  const moduleResolutionMap = Object.fromEntries(
    (Object.keys(modules) as (keyof typeof modules)[]).map((key) => [resolveVirtualModuleId(key), key]),
  )

  return {
    name: 'starlight-to-skills',
    load(id) {
      const moduleId = moduleResolutionMap[id]
      return moduleId ? modules[moduleId]() : undefined
    },
    resolveId(id) {
      return id in modules ? resolveVirtualModuleId(id) : undefined
    },
  }
}

function resolveVirtualModuleId<TModuleId extends string>(id: TModuleId): `\0${TModuleId}` {
  return `\0${id}`
}

export interface StarlightToSkillsContext {
  headingLinks: NonNullable<StarlightConfig['markdown']>['headingLinks']
}

type VitePlugin = NonNullable<ViteUserConfig['plugins']>[number]

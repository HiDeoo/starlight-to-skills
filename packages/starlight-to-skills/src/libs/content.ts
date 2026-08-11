import { MaxSkillLines } from '../schemas/candidate'
import type { StarlightToSkillsConfig } from '../schemas/config'
import { ContentResultJSONSchema, ContentResultSchema, type SkillContentResult } from '../schemas/content'

import { throwError } from './error'
import { getInstructions, UpdateInstructions } from './instructions'
import type { SkillConfiguration } from './loader'
import type { SkillDocumentation } from './starlight'
import { style } from './terminal'

export async function generateSkillContent(
  model: StarlightToSkillsConfig['model'],
  skill: SkillConfiguration,
  docs: SkillDocumentation[],
  update?: SkillUpdate,
): Promise<SkillContentResult> {
  const input = {
    name: skill.name,
    description: skill.description,
    guidance: skill.guidance,
    docs,
    update,
  }

  const maxSkillBodyLines = MaxSkillLines - getSkillFrontmatterLines(skill).length - 1
  const instructions = getInstructions(maxSkillBodyLines)

  const [{ Agent }, { Mastra }] = await Promise.all([import('@mastra/core/agent'), import('@mastra/core/mastra')])

  const mastra = new Mastra({ logger: false })

  const agent = new Agent({
    id: 'starlight-to-skills-agent',
    name: 'Starlight to Skills',
    instructions: update ? `${instructions}\n\n${UpdateInstructions}` : instructions,
    model,
  })

  mastra.addAgent(agent)

  let output: Awaited<ReturnType<typeof agent.generate>>

  try {
    output = await agent.generate(JSON.stringify(input), {
      maxSteps: 1,
      modelSettings: { maxRetries: 0 },
      structuredOutput: { schema: ContentResultJSONSchema, errorStrategy: 'strict' },
    })
  } catch (error) {
    throwError(`Model '${model}' failed to generate ${style.skillName(skill.name)}.`, { cause: error })
  }

  const result = ContentResultSchema.safeParse(output.object)

  if (!result.success) {
    throwError(`Model '${model}' returned an invalid response.`, {
      cause: result.error,
      hint: `Run ${style.command(`starlight-to-skills generate ${skill.name}`)} again.`,
      withCause: false,
    })
  }

  return result.data.data
}

export function compileSkill(
  skill: SkillConfiguration,
  content: Extract<SkillContentResult, { status: 'success' }>,
): SkillFile[] {
  return [
    {
      path: 'SKILL.md',
      content: [...getSkillFrontmatterLines(skill), '', content.body].join('\n'),
    },
    ...content.references.map((reference) => ({ path: reference.path, content: reference.body })),
  ]
}

function getSkillFrontmatterLines(skill: SkillConfiguration): string[] {
  const metadata = Object.entries(skill.metadata ?? {})

  return [
    '---',
    `name: ${JSON.stringify(skill.name)}`,
    `description: ${JSON.stringify(skill.description)}`,
    ...(skill.license ? [`license: ${JSON.stringify(skill.license)}`] : []),
    ...(skill.compatibility ? [`compatibility: ${JSON.stringify(skill.compatibility)}`] : []),
    ...(metadata.length > 0
      ? ['metadata:', ...metadata.map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)]
      : []),
    '---',
  ]
}

export interface SkillFile {
  path: string
  content: string
}

export interface SkillUpdate {
  approvedFiles: SkillFile[]
  changedDocPaths: string[]
}

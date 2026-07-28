import { ContentResultJSONSchema, ContentResultSchema, type SkillContentResult } from '../schemas/content'

import { throwError } from './error'
import { Instructions, UpdateInstructions } from './instructions'
import type { SkillConfiguration } from './loader'
import type { SkillDocumentation } from './starlight'
import { style } from './terminal'

export async function generateSkillContent(
  model: string,
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

  const { Agent } = await import('@mastra/core/agent')

  const agent = new Agent({
    id: 'starlight-to-skills-agent',
    name: 'Starlight to Skills',
    instructions: update ? `${Instructions}\n\n${UpdateInstructions}` : Instructions,
    model,
  })

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
      content: [
        '---',
        `name: ${JSON.stringify(skill.name)}`,
        `description: ${JSON.stringify(skill.description)}`,
        '---',
        '',
        content.body,
      ].join('\n'),
    },
    ...content.references.map((reference) => ({ path: reference.path, content: reference.body })),
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

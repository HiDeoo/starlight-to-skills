import { ContentResultJSONSchema, ContentResultSchema, type SkillContentResult } from '../schemas/content'

import { throwError } from './error'
import type { SkillConfiguration } from './loader'
import type { SkillDocumentation } from './starlight'
import { style } from './terminal'

// TODO(HiDeoo) skill-generation skill
// TODO(HiDeoo) reference seems to link to docs
const instructions = `Generate content for an agent skill using only the provided information and documentation sources.

Documentation sources are authoritative for documented facts.
Guidance may add context, preferences, boundaries, or rules, but it must not override documented facts.
Do not use outside knowledge or follow links.
If required information is missing, return a 'source-incomplete' issue.
If the documentation sources disagree, or guidance contradicts a documented fact, return a 'source-conflict' issue.

Infer the output language from the documentation sources unless guidance specifies a language preference.

Return only the Markdown body for SKILL.md, without frontmatter, and Markdown references when supporting detail would otherwise make SKILL.md less concise.
Link every reference directly from the SKILL.md body.
Ensure every local link resolves to a generated file.
Do not link from one reference to another.
Do not generate or rewrite the skill name or description.`

const updateInstructions = `Use the approved files only as a wording and structure baseline.
The approved files are not documentation sources or factual authority.
If they disagree with the current description, guidance, or documentation sources, update them to match the current inputs instead of reporting a source conflict.
Ignore approved frontmatter and do not return frontmatter in the body.
The changed documentation paths are hints about where updates may be needed, but you must consider every current input.
Preserve all unaffected wording, formatting, ordering, reference paths, and reference content exactly.
Do not clean up, reformat, reorganize, or rephrase unaffected content.
Add, update, or remove body content and references when the current inputs require it.
Return the complete updated body and references, including unchanged content.`

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
    docs: docs.map((doc, index) => ({
      docsPath: skill.docs[index],
      title: doc.title,
      body: doc.body,
    })),
    update,
  }

  const { Agent } = await import('@mastra/core/agent')

  const agent = new Agent({
    id: 'starlight-to-skills-agent',
    name: 'Starlight to Skills',
    instructions: update ? `${instructions}\n\n${updateInstructions}` : instructions,
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
  changedDocsPaths: string[]
}

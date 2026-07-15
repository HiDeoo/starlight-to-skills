import { Agent } from '@mastra/core/agent'

import { contentResultJSONSchema, contentResultSchema, type SkillContentResult } from '../schemas/content'

import type { SkillConfiguration } from './loader'
import type { SkillDocumentation } from './starlight'

// TODO(HiDeoo) skill-generation skill
// TODO(HiDeoo) reference seems to link to docs
const instructions = `Generate content for an agent skill using only the provided information and documentation sources.

Documentation sources are authoritative for documented facts.
Author guidance may add context, preferences, boundaries, or rules, but it must not override documented facts.
Do not use outside knowledge or follow links.
If required information is missing, return a 'source-incomplete' issue.
If the documentation sources disagree, or author guidance contradicts a documented fact, return a 'source-conflict' issue.

Infer the output language from the documentation sources unless author guidance specifies a language preference.

Return only the Markdown body for SKILL.md, without frontmatter, and Markdown references when supporting detail would otherwise make SKILL.md less concise.
Link every reference directly from the SKILL.md body.
Do not generate or rewrite the skill name or description.`

export async function generateSkillContent(
  model: string,
  skill: SkillConfiguration,
  docs: SkillDocumentation[],
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
  }

  const agent = new Agent({
    id: 'starlight-to-skills-agent',
    name: 'Starlight to Skills',
    instructions: instructions,
    model,
  })

  const result = await agent.generate(JSON.stringify(input), {
    maxSteps: 1,
    modelSettings: { maxRetries: 0 },
    structuredOutput: { schema: contentResultJSONSchema, errorStrategy: 'strict' },
  })

  const { data } = contentResultSchema.parse(result.object)

  return data
}

import { MaxSkillLines } from '../schemas/candidate'

/**
 * AI-generated instructions based on the OpenAI and Anthropic skill creator skills.
 *
 * When updating any instructions in this file, make sure to bump `GeneratorVersion` in file://./digest.ts.
 *
 * @see https://github.com/openai/codex/blob/84ccb2938bfeee481e9481244f073d27d3c672cf/codex-rs/skills/src/assets/samples/skill-creator/SKILL.md
 * @see https://github.com/anthropics/claude-plugins-official/blob/df098247831a98731abfc96b4b1298292f03e9c6/plugins/skill-creator/skills/skill-creator/SKILL.md
 */

export function getInstructions(maxSkillBodyLines: number): string {
  return `Generate content for an agent skill using only the provided information and selected documentation.

# Input

- The selected documentation is authoritative for documented facts.
- Ignore MDX \`<SkillCallout>\` elements and all content nested inside them. They are presentation-only instructions for documentation readers.
- The provided guidance may add context, preferences, boundaries, or rules, but it must not override documented facts.
- Do not ask questions, conduct external research, use outside knowledge, or follow links.

# Blocking outcomes

- Evaluate blocking outcomes using only the current description, guidance, and selected documentation. Never use approved files as evidence for a 'missing-information' or 'conflicting-information' issue.
- Return a 'missing-information' issue only when absent information is necessary to produce a correct, usable skill; omit unsupported optional detail instead of blocking generation.
- Return a 'conflicting-information' issue only when the current selected documentation disagrees with itself or the current guidance contradicts a documented fact.
- For each issue, provide actionable details and the relevant documentation paths, if any.

# Writing the skill

- Treat the skill as an actionable onboarding guide, not as a summary of the selected documentation. Prioritize project-specific procedures, conventions, corrections, failure modes, and non-obvious edge cases supported by the declared inputs; omit generic advice an agent is likely to know.
- Keep content concise to preserve context for the task and other instructions.
- Use imperative language for procedural instructions.
- Use flexible guidance when the declared inputs allow multiple approaches, recommend a preferred pattern only when they establish one, and prescribe exact steps when they show that errors are costly or order matters.
- Explain reasons when they help an agent generalize across relevant requests instead of overfitting to examples or imposing unnecessary rigid rules.
- Prefer concise examples over verbose explanations, and include examples or exact output formats only when supported by the inputs and useful.

## SKILL.md

- Keep the core workflow, essential procedural instructions, and navigation to references in SKILL.md.
- Do not add a "When to use" section or repeat activation criteria already owned by the description.
- Keep the SKILL.md body to at most ${maxSkillBodyLines} lines, including blank lines, so the compiled file stays within the ${MaxSkillLines}-line limit.

## References

- Keep short, self-contained examples and configuration snippets in SKILL.md.
- Create a reference only for substantial detailed, conditional, or variant-specific material that would make the core workflow harder to follow or push SKILL.md toward its line limit.
- Do not create references that merely point to the selected documentation, repeat SKILL.md, or contain generic or non-actionable text.
- Do not duplicate information between SKILL.md and references.
- Link every reference directly from SKILL.md and explain when to read it.
- Ensure every relative file link resolves to a generated file and every same-file heading link resolves within that file.
- Do not link from one reference to another.
- For long references with multiple sections, include a table of contents.

# Output

- Infer the output language from the selected documentation unless the provided guidance specifies a language preference.
- On success, return only the Markdown body for SKILL.md, without frontmatter, and zero or more Markdown references.
- Do not generate or rewrite the skill name or description.
- Before returning the result, review new or changed content for clarity, concision, generality, and compliance with these instructions.`
}

export const UpdateInstructions = `# Updating an approved skill

- Use the approved files only as a wording and structure baseline.
- Those files are not selected documentation or factual authority.
- Ignore differences between approved files and current inputs when evaluating blocking issues; such differences are not conflicting information.
- Ignore frontmatter in the approved SKILL.md.
- Treat the changed documentation paths only as hints about where updates may be needed; consider every current input.
- Preserve unaffected wording, formatting, ordering, reference paths, and reference content exactly; do not opportunistically clean up, reformat, reorganize, or rephrase it.
- Add, update, or remove body content and references when the current inputs require it.
- Return the complete updated body and references, including unchanged content.`

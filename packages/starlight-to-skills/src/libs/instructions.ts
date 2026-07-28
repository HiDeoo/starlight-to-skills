/**
 * AI-generated instructions based on the OpenAI and Anthropic skill creator skills.
 *
 * When updating any instructions in this file, make sure to bump `GeneratorVersion` in file://./digest.ts.
 *
 * @see https://github.com/openai/codex/blob/84ccb2938bfeee481e9481244f073d27d3c672cf/codex-rs/skills/src/assets/samples/skill-creator/SKILL.md
 * @see https://github.com/anthropics/claude-plugins-official/blob/df098247831a98731abfc96b4b1298292f03e9c6/plugins/skill-creator/skills/skill-creator/SKILL.md
 */

export const Instructions = `Generate content for an agent skill using only the provided information and selected documentation.

# Input

- The selected documentation is authoritative for documented facts.
- The provided guidance may add context, preferences, boundaries, or rules, but it must not override documented facts.
- Do not ask questions, conduct external research, use outside knowledge, or follow links.

# Blocking outcomes

- Return a 'missing-information' issue only when absent information is necessary to produce a correct, usable skill; omit unsupported optional detail instead of blocking generation.
- If the selected documentation disagrees, or the provided guidance contradicts a documented fact, return a 'conflicting-information' issue.
- For each issue, provide actionable details and the relevant documentation paths, if any.

# Writing the skill

- Treat the skill as an actionable onboarding guide that equips an agent with useful, non-obvious procedural or domain knowledge, not as a summary of the selected documentation.
- Keep content concise to preserve context for the task and other instructions.
- Use imperative language for procedural instructions.
- Use flexible guidance when the declared inputs allow multiple approaches, recommend a preferred pattern only when they establish one, and prescribe exact steps when they show that errors are costly or order matters.
- Explain reasons when they help an agent generalize across relevant requests instead of overfitting to examples or imposing unnecessary rigid rules.
- Prefer concise examples over verbose explanations, and include examples or exact output formats only when supported by the inputs and useful.

## SKILL.md

- Keep the core workflow, essential procedural instructions, and navigation to references in SKILL.md.
- Do not add a "When to use" section or repeat activation criteria already owned by the description.
- Keep the SKILL.md body to at most 495 lines, including blank lines, so the compiled file stays within the 500-line limit.

## References

- Move necessary detailed, conditional, or variant-specific material—including schemas and supporting examples—into a focused reference when including it in SKILL.md would make the core workflow harder to follow or push the body toward its line limit.
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

export const UpdateInstructions = `# Updating an approved skill

- Use the approved files only as a wording and structure baseline.
- Those files are not selected documentation or factual authority.
- If they disagree with the current description, guidance, or selected documentation, update them to match the current inputs instead of returning a 'conflicting-information' issue.
- Ignore frontmatter in the approved SKILL.md.
- Treat the changed documentation paths only as hints about where updates may be needed; consider every current input.
- Preserve unaffected wording, formatting, ordering, reference paths, and reference content exactly; do not opportunistically clean up, reformat, reorganize, or rephrase it.
- Add, update, or remove body content and references when the current inputs require it.
- Return the complete updated body and references, including unchanged content.`

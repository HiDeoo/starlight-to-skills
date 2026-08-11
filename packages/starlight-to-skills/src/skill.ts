import type { SkillDefinition, SkillUserDefinition } from './schemas/skill'

export type { SkillDefinition, SkillUserDefinition }

export function defineSkill(definition: SkillUserDefinition): SkillUserDefinition {
  return definition
}

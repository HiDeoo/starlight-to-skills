import type { StarlightSkillsSyncConfig, StarlightSkillsSyncUserConfig } from './schemas/config'

export type { StarlightSkillsSyncConfig, StarlightSkillsSyncUserConfig }

export function defineConfig(config: StarlightSkillsSyncUserConfig): StarlightSkillsSyncUserConfig {
  return config
}

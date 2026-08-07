declare module 'virtual:starlight-to-skills/context' {
  const context: import('./libs/vite').StarlightToSkillsContext
  export default context
}

declare module 'virtual:starlight-to-skills/skills' {
  const skills: import('./libs/discovery').DiscoverableSkills
  export default skills
}

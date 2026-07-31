import type { StarlightToSkillsConfig } from '../schemas/config'
import type { SkillDigest } from '../schemas/digest'
import type { SkillManifest } from '../schemas/manifest'
import { parseSkillName } from '../schemas/skill'

import { GeneratorVersion } from './digest'
import { createError, type StarlightToSkillsError, throwError } from './error'
import { getSkillManifestUrl, pathExists } from './fs'
import { loadConfig, loadSkillDefinitionInputs, type SkillConfiguration } from './loader'
import {
  discoverSkillDefinitions,
  discoverSkillManifests,
  getSkillDefinitionUrlByName,
  getSkillNameByDefinitionUrl,
  getSkillNameByManifestUrl,
  hasMatchingSkillDescription,
  loadSkill,
} from './skill'
import { formatError, style } from './terminal'

const skillCheckIssueMessages: Record<SkillCheckIssue['type'], string> = {
  'definition-change': 'Skill definition changed',
  'docs-change': 'Documentation content changed',
  'model-change': 'Model changed',
  'generator-change': 'Generator version changed',
  'approved-skill-change': 'Approved skill changed',
}

export async function checkSkills(rootDir: URL): Promise<string> {
  const config = await loadConfig(rootDir)
  const definitionUrls = await discoverSkillDefinitions(config)
  const reports: string[] = []
  let allUpToDate = true
  let hasOrphans = false
  const definitionNames = new Set<string>()

  function addReport(name: string, details: unknown) {
    reports.push(`${style.primarySection(name)}\n\n${formatError(details)}`)
  }

  for (const definitionUrl of definitionUrls) {
    const name = getSkillNameByDefinitionUrl(definitionUrl)

    try {
      definitionNames.add(parseSkillName(name))
    } catch (error) {
      allUpToDate = false
      addReport(name, error)
    }
  }

  for (const name of definitionNames) {
    try {
      const definitionUrl = getSkillDefinitionUrlByName(definitionUrls, name)
      const { definition, digest } = await loadSkillDefinitionInputs(config, definitionUrl)
      const issues = await getSkillIssues(config, definition, digest)

      if (issues) {
        allUpToDate = false
        addReport(name, issues)
      }
    } catch (error) {
      allUpToDate = false
      addReport(name, error)
    }
  }

  for (const skillManifestUrl of await discoverSkillManifests(config.outputDir)) {
    const name = getSkillNameByManifestUrl(skillManifestUrl)
    let skillName: string

    try {
      skillName = parseSkillName(name)
    } catch (error) {
      allUpToDate = false
      addReport(name, error)
      continue
    }

    if (definitionNames.has(skillName)) continue

    allUpToDate = false
    hasOrphans = true
    addReport(skillName, 'Orphan approved skill.')
  }

  const report = reports.join('\n\n')

  if (!allUpToDate) {
    const message = `Not all skills are up to date.\n\n${report}`
    throwError(
      message,
      hasOrphans
        ? {
            hint: `Run ${style.command('starlight-to-skills prune')} to review and remove orphan approved skills.`,
          }
        : undefined,
    )
  }

  return `${style.success('Check complete:')} ${definitionNames.size === 0 ? 'no skills found.' : 'all skills are up to date.'}`
}

export function checkSkill(
  manifest: SkillManifest,
  digest: SkillDigest,
  model: string,
  fileMismatches: string[],
): SkillCheckResult {
  const issues: SkillCheckIssue[] = []

  if (manifest.definitionHash !== digest.definitionHash) issues.push({ type: 'definition-change' })

  const changedDocPaths = manifest.docs
    .filter((doc) =>
      digest.docs.some((matchingDoc) => matchingDoc.path === doc.path && matchingDoc.contentHash !== doc.contentHash),
    )
    .map((doc) => doc.path)

  if (changedDocPaths.length > 0) {
    issues.push({ type: 'docs-change', paths: changedDocPaths })
  }

  if (manifest.model !== model) issues.push({ type: 'model-change' })
  if (manifest.generatorVersion !== GeneratorVersion) issues.push({ type: 'generator-change' })
  if (fileMismatches.length > 0) issues.push({ type: 'approved-skill-change', paths: fileMismatches })

  return issues.length === 0 ? { upToDate: true } : { upToDate: false, issues }
}

export async function getSkillIssues(
  config: StarlightToSkillsConfig,
  definition: SkillConfiguration,
  digest: SkillDigest,
): Promise<StarlightToSkillsError | undefined> {
  const approveCommand = style.command(`starlight-to-skills approve ${definition.name}`)
  const generateCommand = style.command(`starlight-to-skills generate ${definition.name}`)
  const generateHint = `Run ${generateCommand}, review the generated skill, and then run ${approveCommand}.`

  if (!(await pathExists(getSkillManifestUrl(config.outputDir, definition.name)))) {
    return createError(`Skill ${style.skillName(definition.name)} has not been approved.`, { hint: generateHint })
  }

  const { manifest, fileMismatches } = await loadSkill(config.outputDir, definition.name)
  const result = checkSkill(manifest, digest, config.model, fileMismatches)

  if (result.upToDate) return

  const issues = result.issues.map((issue) => {
    const heading = style.section(skillCheckIssueMessages[issue.type])

    switch (issue.type) {
      case 'definition-change': {
        return `${heading}\n\nThe description, documentation file paths, or guidance changed since the skill was approved.`
      }
      case 'approved-skill-change':
      case 'docs-change': {
        const paths = issue.paths.map((path) => `${style.dim(' -')} ${path}`).join('\n')

        return `${heading}\n\n${paths}`
      }
      case 'model-change': {
        return `${heading}\n\n${style.dim(' - Before:')} ${manifest.model}\n${style.dim(' - Now:')} ${config.model}`
      }
      case 'generator-change': {
        return `${heading}\n\n${style.dim(' - Before:')} ${manifest.generatorVersion}\n${style.dim(' - Now:')} ${GeneratorVersion}`
      }
      default: {
        throw new Error(`Unexpected issue: ${JSON.stringify(issue satisfies never)}`)
      }
    }
  })

  const canApproveExistingSkill =
    fileMismatches.length === 0 &&
    (manifest.definitionHash === digest.definitionHash ||
      (await hasMatchingSkillDescription(config.outputDir, definition.name, definition.description)))

  const hints =
    fileMismatches.length > 0
      ? [
          `Restore the listed files. To keep intended changes, update the skill definition or documentation, run ${generateCommand}, review the generated skill, and then run ${approveCommand}.`,
        ]
      : [generateHint]

  if (canApproveExistingSkill) {
    hints.push(
      `Alternatively, if the existing approved skill is still valid, run ${style.command(`starlight-to-skills approve ${definition.name} --existing`)}.`,
    )
  }

  return createError(`Skill ${style.skillName(definition.name)} is not up to date.\n\n${issues.join('\n\n')}`, {
    hint: hints.join(' '),
  })
}

type SkillCheckIssue =
  | { type: 'definition-change' }
  | { type: 'docs-change'; paths: string[] }
  | { type: 'model-change' }
  | { type: 'generator-change' }
  | { type: 'approved-skill-change'; paths: string[] }

type SkillCheckResult = { upToDate: true } | { upToDate: false; issues: SkillCheckIssue[] }

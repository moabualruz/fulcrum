import matter from 'gray-matter'
import type { CanonicalRule, CanonicalSkill, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'
import { readDescription } from './frontmatter.js'

// Cursor uses .mdc files under .cursor/rules/. Per-skill rules emit with
// alwaysApply:false (description-match triggers). Core rules emit with
// alwaysApply:true and always load. AD-1 new emission shape; AD-6 per-skill
// + per-rule identity.
export function emitCursor(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = []
  for (const skill of source.skills) artifacts.push(renderSkill(skill))
  for (const rule of source.rules) artifacts.push(renderRule(rule))
  return { target: 'cursor', artifacts }
}

function renderSkill(skill: CanonicalSkill): EmitArtifact {
  const slug = `fulcrum-skill-${skill.name}`
  const frontmatter = {
    description: readDescription(skill.frontmatter),
    alwaysApply: false,
  }
  return {
    path: `.cursor/rules/${slug}.mdc`,
    contents: matter.stringify(skill.body + '\n', frontmatter),
    sourceSkillName: skill.name,
  }
}

function renderRule(rule: CanonicalRule): EmitArtifact {
  const slug = `fulcrum-rule-${rule.name}`
  const frontmatter = {
    description: readDescription(rule.frontmatter),
    alwaysApply: true,
  }
  return {
    path: `.cursor/rules/${slug}.mdc`,
    contents: matter.stringify(rule.body + '\n', frontmatter),
    sourceRuleName: rule.name,
  }
}

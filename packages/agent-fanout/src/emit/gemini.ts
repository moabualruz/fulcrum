import matter from 'gray-matter'
import type { CanonicalRule, CanonicalSkill, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'
import { readDescription } from './frontmatter.js'

const NAMESPACE_PREFIX = 'fulcrum-'

export function emitGemini(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = []
  for (const skill of source.skills) artifacts.push(renderSkill(skill))
  for (const rule of source.rules) artifacts.push(renderRule(rule))
  // TOML slash commands + 2→24 sub-agent MDs are PR 7 scope.
  return { target: 'gemini', artifacts }
}

function renderSkill(skill: CanonicalSkill): EmitArtifact {
  const namespacedName = `${NAMESPACE_PREFIX}${skill.name}`
  const frontmatter = {
    name: namespacedName,
    description: readDescription(skill.frontmatter),
  }
  return {
    path: `skills/${namespacedName}/SKILL.md`,
    contents: matter.stringify(skill.body + '\n', frontmatter),
    sourceSkillName: skill.name,
  }
}

function renderRule(rule: CanonicalRule): EmitArtifact {
  // Gemini GEMINI.md is the always-on rules surface. Installer injects.
  return {
    path: `rules/fulcrum-rule-${rule.name}.md`,
    contents: rule.raw,
    sourceRuleName: rule.name,
  }
}

import matter from 'gray-matter'
import type { CanonicalRule, CanonicalSkill, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'
import { readDescription } from './frontmatter.js'

// GitHub Copilot (VS Code) uses path-scoped instructions under `.github/instructions/`.
// Skills emit per-skill instruction files. Rules emit as separate always-applying
// instruction files named fulcrum-rule-<name>.instructions.md — Copilot picks
// them up automatically via applyTo: "**".
// NOTE: Copilot has no hook layer — rule reaches the model only when VS Code
// renders the instruction. Documented as known limitation (R6 / PR 10).
export function emitCopilot(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = []
  for (const skill of source.skills) artifacts.push(renderSkill(skill))
  for (const rule of source.rules) artifacts.push(renderRule(rule))
  return { target: 'copilot', artifacts }
}

function renderSkill(skill: CanonicalSkill): EmitArtifact {
  const slug = `fulcrum-skill-${skill.name}`
  const frontmatter = {
    applyTo: '**',
    description: readDescription(skill.frontmatter),
  }
  return {
    path: `.github/instructions/${slug}.instructions.md`,
    contents: matter.stringify(skill.body + '\n', frontmatter),
    sourceSkillName: skill.name,
  }
}

function renderRule(rule: CanonicalRule): EmitArtifact {
  const slug = `fulcrum-rule-${rule.name}`
  const frontmatter = {
    applyTo: '**',
    description: readDescription(rule.frontmatter),
  }
  return {
    path: `.github/instructions/${slug}.instructions.md`,
    contents: matter.stringify(rule.body + '\n', frontmatter),
    sourceRuleName: rule.name,
  }
}

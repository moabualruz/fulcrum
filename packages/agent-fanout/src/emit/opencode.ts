import matter from 'gray-matter'
import type { CanonicalRule, CanonicalSkill, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'
import { readDescription } from './frontmatter.js'

// opencode discovers hidden subagents by description-match. Each canonical skill
// emits as `.opencode/agents/fulcrum-skill-<name>.md` with mode=subagent hidden=true
// (AD-1 new emission shape; AD-6 per-skill identity; AD-7 skill=HOW).
// Rules emit as raw .md files at `.opencode/rules/`; PR 4 plugin reads them into
// OPENCODE_SYSTEM_RIDER at plugin-load time.
export function emitOpencode(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = []
  for (const skill of source.skills) artifacts.push(renderSkill(skill))
  for (const rule of source.rules) artifacts.push(renderRule(rule))
  return { target: 'opencode', artifacts }
}

function renderSkill(skill: CanonicalSkill): EmitArtifact {
  const slug = `fulcrum-skill-${skill.name}`
  const frontmatter = {
    name: slug,
    description: readDescription(skill.frontmatter),
    mode: 'subagent',
    hidden: true,
    permission: { task: { '*': 'deny' } },
  }
  return {
    path: `.opencode/agents/${slug}.md`,
    contents: matter.stringify(skill.body + '\n', frontmatter),
    sourceSkillName: skill.name,
  }
}

function renderRule(rule: CanonicalRule): EmitArtifact {
  return {
    path: `.opencode/rules/fulcrum-rule-${rule.name}.md`,
    contents: rule.raw,
    sourceRuleName: rule.name,
  }
}

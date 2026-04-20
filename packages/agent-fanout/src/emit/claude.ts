import type { CanonicalSource, EmitArtifact, EmitResult } from '../types.js'

// Claude Code consumes the canonical skills directory directly (AD-1). Skill
// emit is a pure identity transform. Rule emit ships raw rule files under
// `rules/`; installer injects into CLAUDE.md marker block later (PR 13).
export function emitClaude(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = []
  for (const skill of source.skills) {
    artifacts.push({
      path: `skills/${skill.name}/SKILL.md`,
      contents: skill.raw,
      sourceSkillName: skill.name,
    })
  }
  for (const rule of source.rules) {
    artifacts.push({
      path: `rules/fulcrum-rule-${rule.name}.md`,
      contents: rule.raw,
      sourceRuleName: rule.name,
    })
  }
  return { target: 'claude', artifacts }
}

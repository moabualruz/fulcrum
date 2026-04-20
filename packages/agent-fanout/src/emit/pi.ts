import type { CanonicalRule, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'

// PI consumes the canonical skills directory natively via the symlink at
// agent-integration/pi/cockpit/skills -> ../../skills (OQ #5). Skill emit is a
// deliberate no-op. Rule emit ships raw rule files under `rules/` for the
// installer to inject into PI.md later (PR 13).
export function emitPi(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = source.rules.map(renderRule)
  return { target: 'pi', artifacts }
}

function renderRule(rule: CanonicalRule): EmitArtifact {
  return {
    path: `rules/fulcrum-rule-${rule.name}.md`,
    contents: rule.raw,
    sourceRuleName: rule.name,
  }
}

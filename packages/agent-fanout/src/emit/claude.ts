import type { CanonicalSource, EmitArtifact, EmitResult } from '../types.js'

// Claude Code consumes the canonical skills directory directly (AD-1). Emit is
// a pure identity transform: the raw bytes captured at parse-time (including the
// original frontmatter ordering) are the emitted contents. No second disk read —
// parse-time is the single secret-scan gate.
export function emitClaude(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = source.skills.map((skill) => ({
    path: `skills/${skill.name}/SKILL.md`,
    contents: skill.raw,
    sourceSkillName: skill.name,
  }))
  return { target: 'claude', artifacts }
}

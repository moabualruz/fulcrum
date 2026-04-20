import matter from 'gray-matter'
import type { CanonicalSkill, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'
import { readDescription } from './frontmatter.js'

// Cursor uses .mdc files under .cursor/rules/. Per-skill rules emit with
// alwaysApply:false so Cursor's "Apply Intelligently" description-match is
// the trigger. Core rule (PR 2) will ship alwaysApply:true separately.
// AD-1 new emission shape; AD-6 per-skill identity.
export function emitCursor(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = source.skills.map(renderSkill)
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

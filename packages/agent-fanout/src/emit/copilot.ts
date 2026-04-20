import matter from 'gray-matter'
import type { CanonicalSkill, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'
import { readDescription } from './frontmatter.js'

// GitHub Copilot (VS Code) uses path-scoped instructions under `.github/instructions/`.
// Each canonical skill emits as `.github/instructions/fulcrum-skill-<name>.instructions.md`
// with `applyTo` frontmatter. AD-1 new emission shape; AD-6 per-skill identity.
// NOTE: Copilot has no hook layer — rule reaches the model only when VS Code renders
// the instruction. Documented as known limitation (R6 / PR 10 install-paths doc).
export function emitCopilot(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = source.skills.map(renderSkill)
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

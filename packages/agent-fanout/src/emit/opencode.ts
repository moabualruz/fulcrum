import matter from 'gray-matter'
import type { CanonicalSkill, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'
import { readDescription } from './frontmatter.js'

// opencode discovers hidden subagents by description-match. Each canonical skill
// emits as `.opencode/agents/fulcrum-skill-<name>.md` with mode=subagent hidden=true
// (AD-1 new emission shape; AD-6 per-skill identity; AD-7 skill=HOW).
export function emitOpencode(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = source.skills.map(renderSkill)
  return { target: 'opencode', artifacts }
}

function renderSkill(skill: CanonicalSkill): EmitArtifact {
  const slug = `fulcrum-skill-${skill.name}`
  const frontmatter = {
    name: slug,
    description: readDescription(skill.frontmatter),
    mode: 'subagent',
    hidden: true,
  }
  return {
    path: `.opencode/agents/${slug}.md`,
    contents: matter.stringify(skill.body + '\n', frontmatter),
    sourceSkillName: skill.name,
  }
}

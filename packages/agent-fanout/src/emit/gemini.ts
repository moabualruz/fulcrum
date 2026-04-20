import matter from 'gray-matter'
import type { CanonicalSkill, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'
import { readDescription } from './frontmatter.js'

const NAMESPACE_PREFIX = 'fulcrum-'

export function emitGemini(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = source.skills.map(renderSkill)
  // TOML slash commands (`commands/<name>.toml`) and 2→24 sub-agent MDs are
  // PR 7 scope (Gemini full hook coverage + policies + 24 sub-agents).
  return { target: 'gemini', artifacts }
}

function renderSkill(skill: CanonicalSkill): EmitArtifact {
  const namespacedName = `${NAMESPACE_PREFIX}${skill.name}`
  const frontmatter = {
    name: namespacedName,
    description: readDescription(skill.frontmatter),
  }
  const contents = matter.stringify(skill.body + '\n', frontmatter)
  return {
    path: `skills/${namespacedName}/SKILL.md`,
    contents,
    sourceSkillName: skill.name,
  }
}

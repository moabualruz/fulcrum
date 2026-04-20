import matter from 'gray-matter'
import type { CanonicalSkill, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'
import { readDescription } from './frontmatter.js'

// Windsurf uses per-skill MD files under .windsurf/rules/. Trigger is
// model_decision so description-match is the activation.
// AD-1 new emission shape. AD-6 per-skill identity.
// Plan-mandated hard lint: Windsurf rule files must be <= 12000 bytes
// (feasibility persona: largest canonical skill is 4.4k; truncation is overkill;
// hard-error on overflow).
export const WINDSURF_MAX_BYTES = 12000

export class WindsurfSizeError extends Error {
  constructor(public readonly skillName: string, public readonly byteLength: number) {
    super(
      `Windsurf rule "${skillName}" is ${byteLength} bytes; max ${WINDSURF_MAX_BYTES}. ` +
        `Split the skill or shrink the body — truncation is not allowed.`,
    )
    this.name = 'WindsurfSizeError'
  }
}

export function emitWindsurf(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = []
  for (const skill of source.skills) {
    const artifact = renderSkill(skill)
    const byteLength = Buffer.byteLength(artifact.contents, 'utf8')
    if (byteLength > WINDSURF_MAX_BYTES) {
      throw new WindsurfSizeError(skill.name, byteLength)
    }
    artifacts.push(artifact)
  }
  return { target: 'windsurf', artifacts }
}

function renderSkill(skill: CanonicalSkill): EmitArtifact {
  const slug = `fulcrum-skill-${skill.name}`
  const frontmatter = {
    description: readDescription(skill.frontmatter),
    trigger: 'model_decision',
  }
  return {
    path: `.windsurf/rules/${slug}.md`,
    contents: matter.stringify(skill.body + '\n', frontmatter),
    sourceSkillName: skill.name,
  }
}

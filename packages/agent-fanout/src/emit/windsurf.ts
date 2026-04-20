import matter from 'gray-matter'
import type { CanonicalRule, CanonicalSkill, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'
import { readDescription } from './frontmatter.js'

// Windsurf uses per-skill MD files under .windsurf/rules/. Per-skill uses
// trigger:model_decision so description-match activates. Core rules use
// trigger:always_on and always load.
// AD-1 new emission shape. AD-6 per-skill + per-rule identity.
// Plan-mandated hard lint: each emitted file must be <= 12000 bytes.
export const WINDSURF_MAX_BYTES = 12000

export class WindsurfSizeError extends Error {
  constructor(
    public readonly artifactName: string,
    public readonly byteLength: number,
  ) {
    super(
      `Windsurf rule "${artifactName}" is ${byteLength} bytes; max ${WINDSURF_MAX_BYTES}. ` +
        `Split the source or shrink the body — truncation is not allowed.`,
    )
    this.name = 'WindsurfSizeError'
  }
}

export function emitWindsurf(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = []
  for (const skill of source.skills) {
    const artifact = renderSkill(skill)
    enforceSize(artifact, skill.name)
    artifacts.push(artifact)
  }
  for (const rule of source.rules) {
    const artifact = renderRule(rule)
    enforceSize(artifact, rule.name)
    artifacts.push(artifact)
  }
  return { target: 'windsurf', artifacts }
}

function enforceSize(artifact: EmitArtifact, name: string): void {
  const byteLength = Buffer.byteLength(artifact.contents, 'utf8')
  if (byteLength > WINDSURF_MAX_BYTES) {
    throw new WindsurfSizeError(name, byteLength)
  }
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

function renderRule(rule: CanonicalRule): EmitArtifact {
  const slug = `fulcrum-rule-${rule.name}`
  const frontmatter = {
    description: readDescription(rule.frontmatter),
    trigger: 'always_on',
  }
  return {
    path: `.windsurf/rules/${slug}.md`,
    contents: matter.stringify(rule.body + '\n', frontmatter),
    sourceRuleName: rule.name,
  }
}

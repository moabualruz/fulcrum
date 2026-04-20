import matter from 'gray-matter'
import type { CanonicalRule, CanonicalSkill, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'
import { readDescription } from './frontmatter.js'

const NAMESPACE_PREFIX = 'fulcrum-'

// Curated map of user-invocable slash commands → canonical skill name.
// Each entry becomes commands/fulcrum/<command>.toml (Gemini's subdir
// namespacing renders them as /fulcrum:<command>). We pick one canonical
// skill per common entry point so the slash menu stays compact — fanning
// all 33 skills out as commands would clutter the TUI.
const SLASH_COMMAND_MAP: Array<{ command: string; skill: string }> = [
  { command: 'cos', skill: 'chief-of-staff-response-format' },
  { command: 'memory', skill: 'recall-before-writing' },
  { command: 'run', skill: 'start-every-task' },
  { command: 'status', skill: 'workspace-status-on-session-start' },
  { command: 'task', skill: 'task-tracking' },
  { command: 'log', skill: 'write-memory-on-completion' },
]

export function emitGemini(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = []
  for (const skill of source.skills) artifacts.push(renderSkill(skill))
  for (const rule of source.rules) artifacts.push(renderRule(rule))
  for (const { command, skill } of SLASH_COMMAND_MAP) {
    const canonical = source.skills.find(s => s.name === skill)
    if (!canonical) continue
    artifacts.push(renderCommand(command, canonical))
  }
  return { target: 'gemini', artifacts }
}

function renderSkill(skill: CanonicalSkill): EmitArtifact {
  const namespacedName = `${NAMESPACE_PREFIX}${skill.name}`
  const frontmatter = {
    name: namespacedName,
    description: readDescription(skill.frontmatter),
  }
  return {
    path: `skills/${namespacedName}/SKILL.md`,
    contents: matter.stringify(skill.body + '\n', frontmatter),
    sourceSkillName: skill.name,
  }
}

function renderRule(rule: CanonicalRule): EmitArtifact {
  // Gemini GEMINI.md is the always-on rules surface. Installer injects.
  return {
    path: `rules/fulcrum-rule-${rule.name}.md`,
    contents: rule.raw,
    sourceRuleName: rule.name,
  }
}

function renderCommand(command: string, skill: CanonicalSkill): EmitArtifact {
  // Gemini TOML command schema per docs/cli/custom-commands.md: description,
  // prompt (body), {{args}} for raw arg injection. Canonical skill body is
  // the prompt; description is pulled from skill frontmatter.
  const description = readDescription(skill.frontmatter)
  const promptBody = skill.body.trim()
  const escapedDescription = description.replace(/"/g, '\\"').replace(/\n/g, ' ')
  const contents =
`description = "${escapedDescription}"

prompt = """
${promptBody}

{{args}}
"""
`
  return {
    path: `commands/fulcrum/${command}.toml`,
    contents,
    sourceSkillName: skill.name,
  }
}

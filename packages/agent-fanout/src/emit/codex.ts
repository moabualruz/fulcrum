import matter from 'gray-matter'
import type { CanonicalRule, CanonicalSkill, CanonicalSource, EmitArtifact, EmitResult } from '../types.js'
import { readDescription } from './frontmatter.js'

const NAMESPACE_PREFIX = 'fulcrum-'

// Fulcrum brand color (indigo-600) — used in every Codex skill sidecar's
// interface.brand_color field so `/plugins` TUI renders a consistent hue.
const FULCRUM_BRAND_COLOR = '#4F46E5'

// Skill names matching this pattern are "write-class": they mutate shared
// state (memory, agent-run lifecycle, team invocation, task status). Codex
// must NOT invoke them implicitly — user or model intent must be explicit.
// Everything else (recall / search / list / status / debug / rule-prescription)
// is safe to allow implicit invocation.
const WRITE_CLASS_NAME_PATTERN = /^(write-|start-|complete-|spawn-|escalate|delegate-|heartbeat|invoke-|block-|team-launch|memory-compact|session-end|task-tracking|run-workflow|worktree-merge|worktree-checkout|integration-worker)/

export function emitCodex(source: CanonicalSource): EmitResult {
  const artifacts: EmitArtifact[] = []
  for (const skill of source.skills) {
    artifacts.push(renderSkill(skill))
    artifacts.push(renderSkillSidecar(skill))
  }
  for (const rule of source.rules) artifacts.push(renderRule(rule))
  return { target: 'codex', artifacts }
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

function renderSkillSidecar(skill: CanonicalSkill): EmitArtifact {
  const namespacedName = `${NAMESPACE_PREFIX}${skill.name}`
  const displayName = toTitleCase(skill.name)
  const description = readDescription(skill.frontmatter)
  const shortDescription = truncate(description.split(/[.!?]/)[0]?.trim() ?? description, 1024)
  const tools = scanForFulcrumTools(skill.body)
  const allowImplicit = !WRITE_CLASS_NAME_PATTERN.test(skill.name)

  const lines: string[] = []
  lines.push('# Auto-emitted by Fulcrum agent-fanout (PR 6.5). Do not hand-edit.')
  lines.push('# Canonical source: agent-integration/skills/' + skill.name + '/SKILL.md')
  lines.push('interface:')
  lines.push(`  display_name: ${yamlScalar(displayName)}`)
  if (shortDescription) lines.push(`  short_description: ${yamlScalar(shortDescription)}`)
  lines.push(`  brand_color: '${FULCRUM_BRAND_COLOR}'`)
  if (tools.length > 0) {
    lines.push('dependencies:')
    lines.push('  tools:')
    for (const t of tools) {
      lines.push(`    - value: ${t}`)
      lines.push(`      description: Fulcrum MCP tool (${t.replace(/^mcp__fulcrum__/, '')})`)
    }
  }
  lines.push('policy:')
  lines.push(`  allow_implicit_invocation: ${allowImplicit}`)
  return {
    path: `skills/${namespacedName}/agents/openai.yaml`,
    contents: lines.join('\n') + '\n',
    sourceSkillName: skill.name,
  }
}

function renderRule(rule: CanonicalRule): EmitArtifact {
  // Codex AGENTS.md is the always-on rules surface. Fan-out emits each rule as
  // a stand-alone file under `rules/`; the installer injects into AGENTS.md
  // under a marker block (PR 13).
  return {
    path: `rules/fulcrum-rule-${rule.name}.md`,
    contents: rule.raw,
    sourceRuleName: rule.name,
  }
}

function toTitleCase(name: string): string {
  return name
    .split('-')
    .map((s) => (s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1)))
    .join(' ')
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// Emit a safe YAML scalar. If the string contains characters that would need
// quoting (:, #, leading/trailing whitespace, starts with YAML indicator), we
// single-quote with YAML escaping (doubled apostrophes). Otherwise leave bare.
function yamlScalar(s: string): string {
  if (s === '') return "''"
  const needsQuote = /[:#\[\]{}&*!|>'"%@`\\,?]/.test(s) || /^\s|\s$/.test(s) || /^[-?]/.test(s) || /\s:\s|\s#/.test(s)
  if (!needsQuote) return s
  return `'${s.replace(/'/g, "''")}'`
}

// Scan the skill body for Fulcrum MCP tool references. Skills cite tools in
// two shapes: (a) `mcp__fulcrum__<name>` (Claude-style) and (b) the CLI form
// `fulcrum action exec <name>`. Both normalize to the canonical
// `mcp__fulcrum__<name>` identifier. Unique, sorted, capped to 50 entries.
function scanForFulcrumTools(body: string): string[] {
  const set = new Set<string>()
  for (const m of body.matchAll(/mcp__fulcrum__([a-zA-Z0-9_]+)/g)) {
    set.add(`mcp__fulcrum__${m[1]}`)
  }
  for (const m of body.matchAll(/fulcrum\s+action\s+exec\s+([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
    set.add(`mcp__fulcrum__${m[1]}`)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b)).slice(0, 50)
}

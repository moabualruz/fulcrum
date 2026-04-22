#!/usr/bin/env tsx
// PR 7.3 / 7.5 / 7.7 — materialize the canonical-source fanout into the Gemini
// extension directory so `~/.gemini/extensions/fulcrum/` ships 33 skills + 3
// rule files + slash commands out of the box. Safe to re-run; wipes and
// re-emits the skills/, rules/, and commands/fulcrum-* trees.
//
//   pnpm tsx scripts/fanout-gemini-extension.ts
//
// The runtime installer (`installGeminiExtension` in agent-integration/install.ts)
// file-copies the materialized output to ~/.gemini/extensions/fulcrum/.
// This script is the source of truth for what ends up there; PR 13 will
// consolidate fanout invocation into a single CLI command.

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { parseCanonicalSource, emitGemini, replaceMarkerBlock } from '../packages/agent-fanout/src/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const agentIntegrationRoot = path.join(repoRoot, 'agent-integration')
const geminiRoot = path.join(agentIntegrationRoot, 'gemini')

const skillsDir = path.join(geminiRoot, 'skills')
const rulesDir = path.join(geminiRoot, 'rules')
const agentsDir = path.join(geminiRoot, 'agents')

if (fs.existsSync(skillsDir)) fs.rmSync(skillsDir, { recursive: true })
if (fs.existsSync(rulesDir)) fs.rmSync(rulesDir, { recursive: true })

const source = parseCanonicalSource({ agentIntegrationRoot })
const result = emitGemini(source)
let skillCount = 0
let ruleCount = 0
let commandCount = 0
for (const art of result.artifacts) {
  const dest = path.join(geminiRoot, art.path)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, art.contents, 'utf8')
  if (art.path.startsWith('skills/')) skillCount++
  else if (art.path.startsWith('rules/')) ruleCount++
  else if (art.path.startsWith('commands/')) commandCount++
}

// 24 canonical role MDs — translate Claude frontmatter (name/description/model/
// tools) to Gemini sub-agent schema (name + description + kind: local). Per
// docs/core/subagents.md (2026-04-20 re-fetch), name + description + kind are
// required; tools/model are optional — we omit tools so Gemini's default tool
// surface applies, and omit model so the user's configured Gemini default runs.
const claudeAgentsDir = path.join(agentIntegrationRoot, 'claude', 'agents')
if (fs.existsSync(agentsDir)) {
  // Only wipe slug.md files we own; keep any pre-existing fulcrum-*.md that
  // shipped via prior pattern (fulcrum-cos.md / fulcrum-memory.md) — the tests
  // assert slug-named files are present; legacy files are additive.
  for (const f of fs.readdirSync(agentsDir)) {
    if (/^[a-z_]+\.md$/.test(f)) fs.rmSync(path.join(agentsDir, f))
  }
}
fs.mkdirSync(agentsDir, { recursive: true })
let agentCount = 0
for (const file of fs.readdirSync(claudeAgentsDir).filter(f => f.endsWith('.md')).sort()) {
  const slug = file.replace(/\.md$/, '')
  const raw = fs.readFileSync(path.join(claudeAgentsDir, file), 'utf8')
  const translated = translateRoleForGemini(raw, slug)
  fs.writeFileSync(path.join(agentsDir, `${slug}.md`), translated, 'utf8')
  agentCount++
}

// GEMINI.md managed block — embed the 3 canonical rules inside a single
// BEGIN/END FULCRUM managed-block v1 region. User-owned prose outside the
// markers (MCP tool reference, URLs, install steps) survives verbatim.
const geminiMdPath = path.join(geminiRoot, 'GEMINI.md')
const existingGeminiMd = fs.existsSync(geminiMdPath) ? fs.readFileSync(geminiMdPath, 'utf8') : ''
const rulesContent = source.rules
  .map(r => r.raw.trim())
  .join('\n\n---\n\n')
const managed = `## Fulcrum canonical rules (auto-generated)\n\n${rulesContent}`
const { contents: newGeminiMd } = replaceMarkerBlock({
  existing: existingGeminiMd,
  managed,
  placement: 'end',
})
fs.writeFileSync(geminiMdPath, newGeminiMd, 'utf8')

console.log(`fanout-gemini-extension: wrote ${skillCount} skills, ${ruleCount} rules, ${commandCount} commands, ${agentCount} agents + GEMINI.md markers → ${path.relative(repoRoot, geminiRoot)}`)

// Rewrite a Claude-flavored role MD to Gemini sub-agent format. Keep the
// description verbatim; drop Claude-only tools.allowed/denied (Gemini has a
// different tool surface) and drop the Claude model line (let Gemini default).
//
// Per docs/core/subagents.md §"Subagent tool isolation": subagents do NOT
// inherit the extension's MCP servers automatically. The fulcrum MCP surface
// must be declared inline on every subagent or the role's documented tool
// capabilities (invoke_team, start_agent_run, …) are unreachable from within
// the subagent loop.
export function translateRoleForGemini(raw: string, slug: string): string {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const body = fmMatch ? fmMatch[2] ?? '' : raw
  const fm = fmMatch ? (fmMatch[1] ?? '') : ''

  // Pull description — accept inline and `>-` folded multi-line forms.
  const descMatch = fm.match(/^description:\s*>[-+]?\s*\n((?:(?:[ \t]+[^\n]*)\n?)+)|^description:\s*(.+?)(?=\n[^ \t]|$)/m)
  let description = ''
  if (descMatch) {
    if (descMatch[1]) {
      description = descMatch[1].split('\n').map(l => l.trim()).filter(Boolean).join(' ')
    } else if (descMatch[2]) {
      description = descMatch[2].trim()
    }
  }
  const descYaml = description.replace(/"/g, '\\"')

  const mcpBlock =
    `mcp_servers:\n` +
    `  fulcrum:\n` +
    `    command: fulcrum\n` +
    `    args: ["serve", "mcp", "--mode", "filtered", "--runtime-capability", "hooks"]\n`

  const fmOut =
    `---\n` +
    `name: ${slug}\n` +
    `description: "${descYaml}"\n` +
    `kind: local\n` +
    mcpBlock +
    `---\n`
  return `${fmOut}${body.startsWith('\n') ? body : '\n' + body}`
}

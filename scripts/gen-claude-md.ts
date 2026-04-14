#!/usr/bin/env node
/**
 * scripts/gen-claude-md.ts
 *
 * Regenerates agent-integration/claude/CLAUDE.md from TOOL_SCHEMAS in mcp-tools.ts.
 *
 * The generated section is bounded by marker comments so the rest of the file
 * (static intro, lifecycle, hook docs) can be edited by hand without being
 * overwritten.
 *
 * Markers:
 *   <!-- GENERATED:tools-start -->
 *   <!-- GENERATED:tools-end -->
 *
 * Usage:
 *   node --import tsx/esm scripts/gen-claude-md.ts
 *   pnpm gen:claude-md
 *
 * CI drift check (add to package.json scripts):
 *   "check:claude-md": "node --import tsx/esm scripts/gen-claude-md.ts --check"
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const ROOT = resolve(__dirname, '..')
const CLAUDE_MD = join(ROOT, 'agent-integration', 'claude', 'CLAUDE.md')

const CHECK_MODE = process.argv.includes('--check')

// ── Import TOOL_SCHEMAS ───────────────────────────────────────────────────────

const { TOOL_SCHEMAS } = await import('../packages/cli/src/mcp-tools.js')

// ── Generate tool documentation section ──────────────────────────────────────

function genToolSection(): string {
  const lines: string[] = [
    '## Available MCP Tools',
    '',
    'All tools are prefixed `mcp__fulcrum__` in Claude Code.',
    '',
    `> Auto-generated from \`TOOL_SCHEMAS\` in \`packages/cli/src/mcp-tools.ts\`.`,
    `> Run \`pnpm gen:claude-md\` to regenerate after editing tools.`,
    '',
    `**Total: ${TOOL_SCHEMAS.length} tools**`,
    '',
  ]

  for (const tool of TOOL_SCHEMAS) {
    lines.push(`### \`mcp__fulcrum__${tool.name}\``)
    lines.push('')
    lines.push(tool.description)
    lines.push('')

    const props = tool.inputSchema.properties
    const required = new Set(tool.inputSchema.required ?? [])
    const propEntries = Object.entries(props)

    if (propEntries.length > 0) {
      lines.push('**Parameters:**')
      lines.push('')
      lines.push('| Name | Type | Required | Description |')
      lines.push('|------|------|----------|-------------|')

      for (const [paramName, paramDef] of propEntries) {
        const def = paramDef as { type?: string; description?: string; enum?: string[] }
        const type = def.enum ? def.enum.map(v => `\`${v}\``).join(' \\| ') : (def.type ?? 'string')
        const req = required.has(paramName) ? 'Yes' : 'No'
        const desc = def.description ?? ''
        lines.push(`| \`${paramName}\` | ${type} | ${req} | ${desc} |`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

// ── Read existing CLAUDE.md and splice generated section ──────────────────────

const START_MARKER = '<!-- GENERATED:tools-start -->'
const END_MARKER = '<!-- GENERATED:tools-end -->'

function spliceSection(original: string, generated: string): string {
  const startIdx = original.indexOf(START_MARKER)
  const endIdx = original.indexOf(END_MARKER)

  if (startIdx === -1 || endIdx === -1) {
    // Markers not present — append section at end
    return original.trimEnd() + '\n\n' + START_MARKER + '\n\n' + generated + '\n\n' + END_MARKER + '\n'
  }

  const before = original.slice(0, startIdx + START_MARKER.length)
  const after  = original.slice(endIdx)
  return before + '\n\n' + generated + '\n\n' + after
}

// ── Main ──────────────────────────────────────────────────────────────────────

const original = readFileSync(CLAUDE_MD, 'utf8')
const generated = genToolSection()
const updated = spliceSection(original, generated)

if (CHECK_MODE) {
  if (original === updated) {
    console.log('CLAUDE.md is up to date.')
    process.exit(0)
  } else {
    console.error('CLAUDE.md is out of date. Run pnpm gen:claude-md to regenerate.')
    process.exit(1)
  }
}

writeFileSync(CLAUDE_MD, updated, 'utf8')
console.log(`Updated ${CLAUDE_MD} — ${TOOL_SCHEMAS.length} tools documented.`)

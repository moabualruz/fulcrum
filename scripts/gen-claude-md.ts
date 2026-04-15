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

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const ROOT = resolve(__dirname, '..')
const CLAUDE_MD = join(ROOT, 'agent-integration', 'claude', 'CLAUDE.md')

// ── Marker constants (exported for tests) ────────────────────────────────────

export const START_MARKER = '<!-- GENERATED:tools-start -->'
export const END_MARKER = '<!-- GENERATED:tools-end -->'
export const COUNT_START = '<!-- GENERATED:tool-count-start -->'
export const COUNT_END = '<!-- GENERATED:tool-count-end -->'

// ── Pure splice helpers (exported for tests) ─────────────────────────────────

export function spliceSection(original: string, generated: string): string {
  const startIdx = original.indexOf(START_MARKER)
  const endIdx = original.indexOf(END_MARKER)

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    // Markers not present or inverted — append section at end
    return original.trimEnd() + '\n\n' + START_MARKER + '\n\n' + generated + '\n\n' + END_MARKER + '\n'
  }

  const before = original.slice(0, startIdx + START_MARKER.length)
  const after  = original.slice(endIdx)
  return before + '\n\n' + generated + '\n\n' + after
}

export function spliceToolCount(original: string, toolCount: number): string {
  const startIdx = original.indexOf(COUNT_START)
  const endIdx = original.indexOf(COUNT_END)
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return original

  const before = original.slice(0, startIdx + COUNT_START.length)
  const after = original.slice(endIdx)
  const line = `\nThe \`fulcrum\` MCP server exposes ${toolCount} tools for task management, memory, agent runs, and workspace context.\n`
  return before + line + after
}

// ── Main (only runs when invoked directly) ───────────────────────────────────

const isMain = process.argv[1] === __filename

if (isMain) {
  const CHECK_MODE = process.argv.includes('--check')

  // Import TOOL_SCHEMAS
  const { TOOL_SCHEMAS } = await import('../packages/cli/src/mcp-tools.js')

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
      lines.push(`### \`mcp__fulcrum__${tool.name}\` — ${tool.title}`)
      lines.push('')
      // Annotation badges
      if (tool.annotations) {
        const badges: string[] = []
        if (tool.annotations.readOnlyHint) badges.push('`read-only`')
        if (tool.annotations.idempotentHint) badges.push('`idempotent`')
        if (tool.annotations.destructiveHint) badges.push('`destructive`')
        if (tool.annotations.openWorldHint) badges.push('`open-world`')
        if (badges.length > 0) {
          lines.push(badges.join(' '))
          lines.push('')
        }
      }
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

  const original = readFileSync(CLAUDE_MD, 'utf8')
  const generated = genToolSection()
  const withTools = spliceSection(original, generated)
  const updated = spliceToolCount(withTools, TOOL_SCHEMAS.length)

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
}

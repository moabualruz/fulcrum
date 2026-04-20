#!/usr/bin/env tsx
// PR 7 unit 7.18 — rewrite all 24 Claude agent MDs from the invalid
// `tools: {allowed: [...], denied: [...]}` object schema to the spec-correct
// flat `tools: [...]` array. Per plugin-dev/skills/agent-development/SKILL.md,
// Claude Code's subagent loader treats `tools:` as an array whitelist; the
// prior object form was silently ignored so chief_of_staff could still call
// Write/Edit/Bash.
//
// Idempotent — running twice is a no-op.

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const agentsDir = join(here, '..', 'agent-integration', 'claude', 'agents')

for (const name of readdirSync(agentsDir)) {
  if (!name.endsWith('.md')) continue
  const file = join(agentsDir, name)
  const raw = readFileSync(file, 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) {
    console.log(`skip ${name}: no frontmatter`)
    continue
  }
  const fm = m[1]!
  const body = m[2]!

  // Match: tools:\n  allowed:\n    - X\n  denied:\n    - Y
  const toolsMatch = fm.match(
    /^tools:\s*\n((?:[ \t]+[^\n]*\n)+)/m
  )
  if (!toolsMatch) continue // already flat or missing

  const block = toolsMatch[1]!
  if (!/^\s+allowed:/m.test(block)) continue // already flat

  // Extract only the `allowed:` list entries.
  const allowedItems: string[] = []
  let inAllowed = false
  for (const line of block.split('\n')) {
    if (/^\s+allowed:/.test(line)) { inAllowed = true; continue }
    if (/^\s+denied:/.test(line)) { inAllowed = false; continue }
    if (inAllowed) {
      const item = line.match(/^\s+-\s+(.+?)\s*$/)
      if (item) allowedItems.push(item[1]!)
    }
  }

  const flatTools = `tools: [${allowedItems.map((t) => JSON.stringify(t)).join(', ')}]`
  const newFm = fm.replace(
    /^tools:\s*\n(?:[ \t]+[^\n]*\n?)+/m,
    flatTools + '\n'
  )
  const out = `---\n${newFm.trimEnd()}\n---\n${body}`
  writeFileSync(file, out)
  console.log(`fixed ${name}: ${allowedItems.length} tools`)
}

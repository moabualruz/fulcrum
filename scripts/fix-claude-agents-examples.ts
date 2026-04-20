#!/usr/bin/env tsx
// PR 7 unit 7.24 — append a generic <example> usage block to every Claude
// agent MD body. The Task tool's auto-delegation uses the agent description
// + body for semantic matching; <example> blocks in the canonical pattern
// give the parent Claude a concrete dispatch signal. Idempotent.

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const agentsDir = join(here, '..', 'agent-integration', 'claude', 'agents')

const EXAMPLE_BLOCK = `

## Example dispatch

<example>
Context: user asks the parent Claude to do something that matches this
role's responsibilities.
User: can you do X?
Assistant: I'll delegate this to the \`REPLACE_ME_ROLE_SLUG\` subagent, which
is scoped to exactly this kind of work.
</example>
`

for (const name of readdirSync(agentsDir)) {
  if (!name.endsWith('.md')) continue
  const file = join(agentsDir, name)
  const raw = readFileSync(file, 'utf8')
  if (/<example>/i.test(raw)) continue // already has one
  const slug = name.replace(/\.md$/, '')
  const block = EXAMPLE_BLOCK.replace('REPLACE_ME_ROLE_SLUG', slug)
  writeFileSync(file, raw.trimEnd() + block)
  console.log(`added example block: ${name}`)
}

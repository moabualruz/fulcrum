// Validates a Claude Code plugin.json against required field schema.
// Run: node scripts/validate-claude-plugin.mjs <path-to-plugin.json>
//
// Required fields per docs/research/plugin-standards-per-agent-host.md §"Claude Code" lines 67-68.

import { readFileSync } from 'node:fs'

const pluginPath = process.argv[2]
if (!pluginPath) {
  console.error('Usage: node scripts/validate-claude-plugin.mjs <path-to-plugin.json>')
  process.exit(2)
}

let plugin
try {
  plugin = JSON.parse(readFileSync(pluginPath, 'utf8'))
} catch (err) {
  console.error(`Failed to read/parse ${pluginPath}: ${err}`)
  process.exit(1)
}

const REQUIRED = ['name', 'description', 'version']
const errors = []

for (const field of REQUIRED) {
  if (!plugin[field]) errors.push(`Missing required field: ${field}`)
  if (typeof plugin[field] !== 'string') errors.push(`Field '${field}' must be a string`)
}

if (errors.length > 0) {
  console.error('plugin.json validation FAILED:')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log(`✓ plugin.json is valid — name="${plugin.name}" version="${plugin.version}"`)

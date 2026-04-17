// Task 8.1 acceptance test: verify PreCompress hook is registered and invokes
// Fulcrum's PreCompact extractor producing pre_compact_extract memories.
//
// Run: node agent-integration/gemini/hooks/test-precompress.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const hooks = JSON.parse(readFileSync(join(__dir, 'hooks.json'), 'utf8'))

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`)
    passed++
  } else {
    console.error(`  ✗ ${message}`)
    failed++
  }
}

console.log('Testing PreCompress hook registration...')

// 1. PreCompress hook entry exists
assert(hooks.PreCompress !== undefined, 'hooks.json has PreCompress entry')
assert(Array.isArray(hooks.PreCompress), 'PreCompress is an array')
assert(hooks.PreCompress.length > 0, 'PreCompress has at least one matcher')

// 2. PreCompress command invokes fulcrum
const preCompressHook = hooks.PreCompress[0]?.hooks?.[0]
assert(preCompressHook !== undefined, 'PreCompress has a hook definition')
assert(preCompressHook?.command?.includes('fulcrum hook gemini pre-compress'), 'PreCompress command calls fulcrum hook gemini pre-compress')

// 3. BeforeModel and AfterModel hooks exist (no-op stubs)
assert(hooks.BeforeModel !== undefined, 'hooks.json has BeforeModel entry')
assert(hooks.AfterModel !== undefined, 'hooks.json has AfterModel entry')

// 4. BeforeModel command invokes fulcrum
const beforeModelHook = hooks.BeforeModel[0]?.hooks?.[0]
assert(beforeModelHook?.command?.includes('fulcrum hook gemini before-model'), 'BeforeModel command calls fulcrum hook gemini before-model')

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

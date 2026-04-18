// packages/cli/src/commands/memory-lint.ts
//
// Memory v3 PR 6 unit 6.5 — `fulcrum memory lint` verification pass.
//
// Thin wrapper around `lintMemoryVault` so the CLI and MCP tool call
// through one function. The lint itself lives in fulcrum-memory.

import { getDb } from 'fulcrum-agent-core'
import { lintMemoryVault } from 'fulcrum-memory'
import type { LintReport } from 'fulcrum-memory'

export interface LintInput {
  workspace_id?: string
}

export function lintMemory(_input: LintInput = {}): LintReport {
  return lintMemoryVault(getDb())
}

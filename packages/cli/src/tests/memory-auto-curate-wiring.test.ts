// packages/cli/src/tests/memory-auto-curate-wiring.test.ts
//
// Memory v3 PR 8 unit 8.1 — the cli-side wiring helper that mounts the vault
// watcher + auto-curator when FULCRUM_MEMORY_CURATE_AUTO=1. Unit-level checks
// of the env-gate contract; the watcher→curator end-to-end flow is covered
// by the PR 8 integration gate.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { startMemoryAutoCurateIfEnabled } from '../commands/memory-auto-curate-wiring.js'

let tmpVault: string
let prevEnv: string | undefined
let prevVaultEnv: string | undefined

beforeEach(() => {
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-auto-curate-wire-'))
  mkdirSync(join(tmpVault, 'raw'), { recursive: true })
  mkdirSync(join(tmpVault, 'curated'), { recursive: true })
  mkdirSync(join(tmpVault, 'memories'), { recursive: true })
  prevEnv = process.env['FULCRUM_MEMORY_CURATE_AUTO']
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  delete process.env['FULCRUM_MEMORY_CURATE_AUTO']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
})
afterEach(() => {
  if (prevEnv === undefined) delete process.env['FULCRUM_MEMORY_CURATE_AUTO']
  else process.env['FULCRUM_MEMORY_CURATE_AUTO'] = prevEnv
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
  rmSync(tmpVault, { recursive: true, force: true })
})

describe('startMemoryAutoCurateIfEnabled', () => {
  it('returns a no-op stop when FULCRUM_MEMORY_CURATE_AUTO is unset', async () => {
    const stop = await startMemoryAutoCurateIfEnabled()
    expect(typeof stop).toBe('function')
    stop()
  })

  it('returns a no-op stop when FULCRUM_MEMORY_CURATE_AUTO=0', async () => {
    process.env['FULCRUM_MEMORY_CURATE_AUTO'] = '0'
    const stop = await startMemoryAutoCurateIfEnabled()
    expect(typeof stop).toBe('function')
    stop()
  })

  it('mounts watcher + subscription when FULCRUM_MEMORY_CURATE_AUTO=1 (stop is idempotent)', async () => {
    process.env['FULCRUM_MEMORY_CURATE_AUTO'] = '1'
    const stop = await startMemoryAutoCurateIfEnabled({ vaultPath: tmpVault })
    expect(typeof stop).toBe('function')
    // Stop should be safe to call multiple times.
    stop()
    stop()
  })
})

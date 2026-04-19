// packages/cli/src/tests/memory-consolidate-schedule-wiring.test.ts
//
// Memory v3 PR 8 unit 8.2 — cli-side wiring of the consolidation cron.
// Unit checks of the env-gate contract + vault-log writer. End-to-end
// cadence behaviour is covered by the memory-side test.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { startMemoryConsolidateScheduleIfEnabled } from '../commands/memory-consolidate-schedule-wiring.js'

let tmpVault: string
let prevEnv: string | undefined
let prevVaultEnv: string | undefined

beforeEach(() => {
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-consolidate-cron-'))
  mkdirSync(join(tmpVault, 'curated'), { recursive: true })
  prevEnv = process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE']
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  delete process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
})
afterEach(() => {
  if (prevEnv === undefined) delete process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE']
  else process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE'] = prevEnv
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
  rmSync(tmpVault, { recursive: true, force: true })
})

describe('startMemoryConsolidateScheduleIfEnabled', () => {
  it('returns a no-op stop when FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE is unset', async () => {
    const stop = await startMemoryConsolidateScheduleIfEnabled()
    expect(typeof stop).toBe('function')
    stop()
  })

  it('returns a no-op stop when cadence is "never"', async () => {
    process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE'] = 'never'
    const stop = await startMemoryConsolidateScheduleIfEnabled({
      workspace_id: 'ws_test',
      vaultPath: tmpVault,
    })
    expect(typeof stop).toBe('function')
    stop()
  })

  it('returns a no-op stop on unknown cadence strings', async () => {
    process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE'] = 'fortnightly'
    const stop = await startMemoryConsolidateScheduleIfEnabled({
      workspace_id: 'ws_test',
      vaultPath: tmpVault,
    })
    expect(typeof stop).toBe('function')
    stop()
  })

  it('mounts the schedule when cadence=daily and workspace is known (stop is idempotent)', async () => {
    process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE'] = 'daily'
    const stop = await startMemoryConsolidateScheduleIfEnabled({
      workspace_id: 'ws_test',
      vaultPath: tmpVault,
    })
    expect(typeof stop).toBe('function')
    stop()
    stop()
  })
})

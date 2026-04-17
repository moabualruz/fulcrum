// v2b PR 12 Task 3.3 — fail-closed on missing policy rule.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { recallMemory } from '../recall.js'

describe('recall global scope — missing policy rule fail-closed', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    resetTestDb()
  })

  it('unknown role with no policy row is denied (fail-closed)', async () => {
    seedWorkspaceAndProject(db, 'ws1', 'proj1')
    const result = await recallMemory({
      query: 'test',
      workspace_id: 'ws1',
      project_id: 'proj1',
      query_scope: 'global',
      caller_role: 'unknown_custom_role_xyz',
    }) as { results: unknown[]; reason?: string }
    expect(result.results).toEqual([])
    expect(result.reason).toBe('policy_denied')
  })

  it('emits policy_rule_missing telemetry for unknown roles', async () => {
    // TEST-B: plan mandated a `policy_rule_missing` telemetry event as a
    // separate observable from the response envelope. Without this test, a
    // regression that dropped the telemetry would pass the deny-response test.
    seedWorkspaceAndProject(db, 'ws1', 'proj1')
    const warnings: string[] = []
    const origWarn = console.warn
    console.warn = (msg: unknown) => warnings.push(String(msg))
    try {
      await recallMemory({
        query: 'test',
        workspace_id: 'ws1',
        project_id: 'proj1',
        query_scope: 'global',
        caller_role: 'unknown_custom_role_xyz',
      })
    } finally {
      console.warn = origWarn
    }
    expect(warnings.some(w => w.includes('policy_rule_missing'))).toBe(true)
    expect(warnings.some(w => w.includes('unknown_custom_role_xyz'))).toBe(true)
  })
})

// v2b PR 12 Task 3.5 — list_activations action tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { listActivations } from '../list-activations.js'

describe('list_activations — v2b PR 12 Task 3.5', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, 'ws1', 'proj1')
  })

  afterEach(() => {
    resetTestDb()
  })

  it('returns an object with active_workflows, active_teams, active_runs, policy_overrides', async () => {
    const result = await listActivations({ workspace_id: 'ws1', project_id: 'proj1' })
    expect(Array.isArray(result.active_workflows)).toBe(true)
    expect(Array.isArray(result.active_teams)).toBe(true)
    expect(Array.isArray(result.active_runs)).toBe(true)
    expect(Array.isArray(result.policy_overrides)).toBe(true)
  })

  it('returns empty arrays for a fresh workspace with no activations', async () => {
    const result = await listActivations({ workspace_id: 'ws1', project_id: 'proj1' })
    expect(result.active_workflows).toHaveLength(0)
    expect(result.active_teams).toHaveLength(0)
  })
})

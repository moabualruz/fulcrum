// v2b PR 12 Task 3.3 — scope='global' recall with role-policy gate.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { recallMemory } from '../recall.js'
import { writeMemory } from '../write.js'

describe('recall global scope — v2b PR 12 Task 3.3', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    resetTestDb()
  })

  it('chief_of_staff is allowed to use scope=global', async () => {
    seedWorkspaceAndProject(db, 'ws1', 'proj1')
    // Write a memory to ws1
    await writeMemory({
      content: 'cross-workspace test decision',
      title: 'cross-workspace test decision',
      summary: 'cross-workspace test decision',
      workspace_id: 'ws1',
      project_id: 'proj1',
      kind: 'decision',
      scope: 'project',
    })
    // chief_of_staff can recall globally — no policy_denied error
    const result = await recallMemory({
      query: 'cross-workspace test',
      workspace_id: 'ws1',
      project_id: 'proj1',
      query_scope: 'global',
      caller_role: 'chief_of_staff',
    })
    // chief_of_staff gets through policy gate — returns CompactMemory[] directly
    expect(Array.isArray(result)).toBe(true)
  })

  it('software_engineer is denied scope=global (policy_denied)', async () => {
    seedWorkspaceAndProject(db, 'ws1', 'proj1')
    const result = await recallMemory({
      query: 'test',
      workspace_id: 'ws1',
      project_id: 'proj1',
      query_scope: 'global',
      caller_role: 'software_engineer',
    }) as { results: unknown[]; reason?: string }
    expect(result.results).toEqual([])
    expect(result.reason).toBe('policy_denied')
  })
})

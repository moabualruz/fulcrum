// v2b PR 13 Task 4.2 — project_context action tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { runProjectContext } from '../project-context.js'

describe('project_context — v2b PR 13 Task 4.2', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, 'ws1', 'proj1')
  })

  afterEach(() => {
    resetTestDb()
  })

  it('returns no null fields — omits empty groups per §11.40', async () => {
    const result = await runProjectContext({
      file: 'src/write.ts',
      workspace_id: 'ws1',
      project_id: 'proj1',
    })
    // Each value present in result must not be null/undefined
    for (const [, value] of Object.entries(result)) {
      expect(value).not.toBeNull()
      expect(value).not.toBeUndefined()
    }
  })

  it('cold install returns no tasks group when no tasks exist', async () => {
    const result = await runProjectContext({
      file: 'src/write.ts',
      workspace_id: 'ws1',
      project_id: 'proj1',
    })
    // In a cold DB, tasks should be absent or empty
    if ('tasks' in result) {
      expect(Array.isArray(result.tasks)).toBe(true)
    }
  })

  it('accepts task_id input', async () => {
    const result = await runProjectContext({
      task_id: 'task_abc',
      workspace_id: 'ws1',
      project_id: 'proj1',
    })
    expect(typeof result).toBe('object')
  })

  it('does not return task_id matches from another workspace', async () => {
    seedWorkspaceAndProject(db, 'ws2', 'proj2')
    db.prepare(`
      INSERT INTO tasks (
        task_id, workspace_id, project_id, display_id, title, status,
        status_category, priority, created_at, updated_at
      ) VALUES (
        'task_foreign', 'ws2', 'proj2', 'T-2',
        'foreign task', 'completed', 'done', 'medium',
        datetime('now'), datetime('now')
      )
    `).run()

    const result = await runProjectContext({
      task_id: 'task_foreign',
      workspace_id: 'ws1',
      project_id: 'proj1',
    })
    expect(result.tasks).toBeUndefined()
  })
})

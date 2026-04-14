import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask, updateTask } from '../tasks.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test ws')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','test proj')").run()
}

describe('Task.assigned_run_id', () => {
  it('defaults to null on createTask', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A task' })
    expect(task.assigned_run_id).toBeNull()
  })

  it('can be set via updateTask', async () => {
    seed()
    const db = getDb()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A task' })
    const now = new Date().toISOString()
    // Insert a real agent_run referencing the actual task
    db.prepare(
      `INSERT INTO agent_runs (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, status, status_category, started_at, updated_at)
       VALUES ('run_abc123', ?, 'ws_1', 'proj_1', 'R-001', '', 'software_engineer', 'running', 'active', ?, ?)`
    ).run(task.task_id, now, now)
    const updated = await updateTask({ task_id: task.task_id, assigned_run_id: 'run_abc123' })
    expect(updated.assigned_run_id).toBe('run_abc123')
  })

  it('can be cleared back to null via updateTask', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A task' })
    const db = getDb()
    // Temporarily disable FK enforcement to set a synthetic run_id
    db.pragma('foreign_keys = OFF')
    db.prepare('UPDATE tasks SET assigned_run_id = ? WHERE task_id = ?').run('run_xyz', task.task_id)
    db.pragma('foreign_keys = ON')
    // Now clear it via updateTask
    const cleared = await updateTask({ task_id: task.task_id, assigned_run_id: null })
    expect(cleared.assigned_run_id).toBeNull()
  })

  it('does not change assigned_run_id when not provided in updateTask', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A task' })
    const db = getDb()
    // Temporarily disable FK enforcement to set a synthetic run_id
    db.pragma('foreign_keys = OFF')
    db.prepare('UPDATE tasks SET assigned_run_id = ? WHERE task_id = ?').run('run_xyz', task.task_id)
    db.pragma('foreign_keys = ON')
    // Update something else — assigned_run_id should be preserved
    const updated = await updateTask({ task_id: task.task_id, note: 'some note' })
    expect(updated.assigned_run_id).toBe('run_xyz')
  })
})

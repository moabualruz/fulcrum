import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { listTasks, createTask, updateTask } from '../tasks.js'

beforeEach(() => createTestDb())
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test ws', datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test proj', datetime('now'))").run()
}

describe('createTask', () => {
  it('creates a task with queued status', async () => {
    seed()
    const task = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Write tests',
    })
    expect(task.status).toBe('queued')
    expect(task.title).toBe('Write tests')
    expect(task.version).toBe(0)
    expect(task.depends_on).toEqual([])
    expect(task.task_id).toMatch(/^[0-9A-Z]{26}$/) // ULID
  })

  it('creates a task with dependencies', async () => {
    seed()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A' })
    const t2 = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'B',
      depends_on: [t1.task_id],
    })
    expect(t2.depends_on).toEqual([t1.task_id])
  })
})

describe('listTasks', () => {
  it('returns all tasks for a workspace', async () => {
    seed()
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T2' })
    const tasks = await listTasks({ workspace_id: 'ws_1' })
    expect(tasks).toHaveLength(2)
  })

  it('filters by status', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    await updateTask({ task_id: t.task_id, status: 'completed' })
    const queued = await listTasks({ workspace_id: 'ws_1', status: 'queued' })
    const completed = await listTasks({ workspace_id: 'ws_1', status: 'completed' })
    expect(queued).toHaveLength(0)
    expect(completed).toHaveLength(1)
  })

  it('filters by project_id', async () => {
    seed()
    const db = getDb()
    db.prepare("INSERT INTO projects VALUES ('proj_2','ws_1','other proj', datetime('now'))").run()
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'In proj 1' })
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_2', title: 'In proj 2' })
    const tasks = await listTasks({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('In proj 1')
  })
})

describe('updateTask', () => {
  it('increments version on update', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const updated = await updateTask({ task_id: t.task_id, note: 'working on it' })
    expect(updated.version).toBe(1)
    const again = await updateTask({ task_id: t.task_id, note: 'done' })
    expect(again.version).toBe(2)
  })

  it('throws version_conflict when expected_version mismatches', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    await updateTask({ task_id: t.task_id, note: 'first' }) // now version=1
    await expect(
      updateTask({ task_id: t.task_id, note: 'conflict', expected_version: 0 })
    ).rejects.toMatchObject({ code: 'version_conflict' })
  })

  it('throws not_found for unknown task_id', async () => {
    seed()
    await expect(
      updateTask({ task_id: 'NONEXISTENT', status: 'completed' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

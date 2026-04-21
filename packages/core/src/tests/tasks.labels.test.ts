import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask, updateTask, listTasks } from '../tasks.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test ws')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','test proj')").run()
}

describe('Task labels', () => {
  it('returns empty labels array when no labels are set', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'No labels' })
    expect(task.labels).toEqual([])
  })

  it('stores and returns labels set on createTask', async () => {
    seed()
    const task = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Labelled task',
      labels: ['bug', 'frontend'],
    })
    expect(task.labels).toEqual(['bug', 'frontend'])
  })

  it('returns labels sorted alphabetically', async () => {
    seed()
    const task = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Sorted labels',
      labels: ['zebra', 'alpha', 'mango'],
    })
    expect(task.labels).toEqual(['alpha', 'mango', 'zebra'])
  })

  it('replaces labels when updateTask is called with new labels', async () => {
    seed()
    const task = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Update labels',
      labels: ['old-label'],
    })
    expect(task.labels).toEqual(['old-label'])
    const updated = await updateTask({ task_id: task.task_id, labels: ['new-label-a', 'new-label-b'] })
    expect(updated.labels).toEqual(['new-label-a', 'new-label-b'])
  })

  it('clears labels when updateTask is called with empty array', async () => {
    seed()
    const task = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Clear labels',
      labels: ['to-be-removed'],
    })
    const updated = await updateTask({ task_id: task.task_id, labels: [] })
    expect(updated.labels).toEqual([])
  })

  it('does not change labels when updateTask is called without labels field', async () => {
    seed()
    const task = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Preserve labels',
      labels: ['keep-me'],
    })
    const updated = await updateTask({ task_id: task.task_id, note: 'some note' })
    expect(updated.labels).toEqual(['keep-me'])
  })

  it('listTasks returns labels for each task', async () => {
    seed()
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1', labels: ['x'] })
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T2' })
    const tasks = await listTasks({ workspace_id: 'ws_1' })
    expect(tasks.find(t => t.title === 'T1')?.labels).toEqual(['x'])
    expect(tasks.find(t => t.title === 'T2')?.labels).toEqual([])
  })
})

describe('Task blockers', () => {
  it('returns empty blockers array when no relations exist', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'No blockers' })
    expect(task.blockers).toEqual([])
  })

  it('returns blocker task_ids when task_relations with blocks relation exist', async () => {
    seed()
    const blocker = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Blocker' })
    const blocked = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Blocked' })

    // Insert a relation: blocker blocks blocked
    const db = getDb()
    db.prepare(
      "INSERT INTO task_relations (task_id, target_task_id, relation_type) VALUES (?, ?, 'blocks')"
    ).run(blocker.task_id, blocked.task_id)

    // Re-fetch via listTasks to get hydrated data
    const tasks = await listTasks({ workspace_id: 'ws_1' })
    const blockedTask = tasks.find(t => t.task_id === blocked.task_id)!
    expect(blockedTask.blockers).toEqual([blocker.task_id])
  })

  it('does not include blockers from non-blocks relation types', async () => {
    seed()
    const other = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Other' })
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Task' })

    const db = getDb()
    db.prepare(
      "INSERT INTO task_relations (task_id, target_task_id, relation_type) VALUES (?, ?, 'relates')"
    ).run(other.task_id, task.task_id)

    const tasks = await listTasks({ workspace_id: 'ws_1' })
    const found = tasks.find(t => t.task_id === task.task_id)!
    expect(found.blockers).toEqual([])
  })

  it('returns multiple blockers when multiple tasks block this task', async () => {
    seed()
    const b1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Blocker 1' })
    const b2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Blocker 2' })
    const target = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Target' })

    const db = getDb()
    db.prepare(
      "INSERT INTO task_relations (task_id, target_task_id, relation_type) VALUES (?, ?, 'blocks')"
    ).run(b1.task_id, target.task_id)
    db.prepare(
      "INSERT INTO task_relations (task_id, target_task_id, relation_type) VALUES (?, ?, 'blocks')"
    ).run(b2.task_id, target.task_id)

    const tasks = await listTasks({ workspace_id: 'ws_1' })
    const targetTask = tasks.find(t => t.task_id === target.task_id)!
    expect(targetTask.blockers).toHaveLength(2)
    expect(targetTask.blockers).toContain(b1.task_id)
    expect(targetTask.blockers).toContain(b2.task_id)
  })

  it('does not include blocker task_ids from another workspace', async () => {
    seed()
    const target = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Target' })
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2', 'other')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2', 'ws_2', 'other')").run()
    const foreignBlocker = await createTask({ workspace_id: 'ws_2', project_id: 'proj_2', title: 'Foreign blocker' })

    db.prepare(
      "INSERT INTO task_relations (task_id, target_task_id, relation_type) VALUES (?, ?, 'blocks')"
    ).run(foreignBlocker.task_id, target.task_id)

    const tasks = await listTasks({ workspace_id: 'ws_1' })
    const targetTask = tasks.find(t => t.task_id === target.task_id)!
    expect(targetTask.blockers).toEqual([])
  })
})

// packages/planning/src/tests/relations.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import { createTask, getDb } from 'fulcrum-agent-core'
import { addTaskRelation, removeTaskRelation, getBlockers, getTaskRelations } from '../relations.js'

beforeEach(() => { const db = createTestDb(); seed(db) })
afterEach(() => resetTestDb())

function seedWorkspace(db: ReturnType<typeof getDb>, workspaceId: string, projectId: string): void {
  db.prepare('INSERT INTO workspaces (workspace_id, name) VALUES (?, ?)').run(workspaceId, workspaceId)
  db.prepare('INSERT INTO projects (project_id, workspace_id, name) VALUES (?, ?, ?)').run(projectId, workspaceId, projectId)
}

async function makeTask(title: string, workspace_id = 'ws_1', project_id = 'proj_1') {
  return createTask({ workspace_id, project_id, title })
}

describe('addTaskRelation', () => {
  it('adds a blocks relation between two tasks', async () => {
    const t1 = await makeTask('T1')
    const t2 = await makeTask('T2')
    await addTaskRelation({ workspace_id: 'ws_1', task_id: t1.task_id, target_task_id: t2.task_id, relation_type: 'blocks' })
    const db = getDb()
    const row = db.prepare(
      'SELECT * FROM task_relations WHERE task_id = ? AND target_task_id = ? AND relation_type = ?'
    ).get(t1.task_id, t2.task_id, 'blocks') as Record<string, unknown> | undefined
    expect(row).toBeDefined()
  })

  it('is idempotent — adding same relation twice does not throw', async () => {
    const t1 = await makeTask('T1')
    const t2 = await makeTask('T2')
    await addTaskRelation({ workspace_id: 'ws_1', task_id: t1.task_id, target_task_id: t2.task_id, relation_type: 'blocks' })
    await expect(
      addTaskRelation({ workspace_id: 'ws_1', task_id: t1.task_id, target_task_id: t2.task_id, relation_type: 'blocks' })
    ).resolves.toBeUndefined()
  })

  it('throws not_found when task_id does not exist', async () => {
    const t2 = await makeTask('T2')
    await expect(
      addTaskRelation({ workspace_id: 'ws_1', task_id: 'NONEXISTENT', target_task_id: t2.task_id, relation_type: 'blocks' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws not_found when target_task_id does not exist', async () => {
    const t1 = await makeTask('T1')
    await expect(
      addTaskRelation({ workspace_id: 'ws_1', task_id: t1.task_id, target_task_id: 'NONEXISTENT', relation_type: 'blocks' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws invalid_input when task_id equals target_task_id', async () => {
    const t1 = await makeTask('T1')
    await expect(
      addTaskRelation({ workspace_id: 'ws_1', task_id: t1.task_id, target_task_id: t1.task_id, relation_type: 'blocks' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('throws not_found when target task belongs to another workspace', async () => {
    const db = getDb()
    seedWorkspace(db, 'ws_2', 'proj_2')
    const t1 = await makeTask('T1')
    const foreign = await makeTask('Foreign', 'ws_2', 'proj_2')

    await expect(
      addTaskRelation({ workspace_id: 'ws_1', task_id: t1.task_id, target_task_id: foreign.task_id, relation_type: 'blocks' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('removeTaskRelation', () => {
  it('removes an existing relation', async () => {
    const t1 = await makeTask('T1')
    const t2 = await makeTask('T2')
    await addTaskRelation({ workspace_id: 'ws_1', task_id: t1.task_id, target_task_id: t2.task_id, relation_type: 'blocks' })
    await removeTaskRelation({ workspace_id: 'ws_1', task_id: t1.task_id, target_task_id: t2.task_id, relation_type: 'blocks' })
    const db = getDb()
    const row = db.prepare(
      'SELECT * FROM task_relations WHERE task_id = ? AND target_task_id = ? AND relation_type = ?'
    ).get(t1.task_id, t2.task_id, 'blocks') as Record<string, unknown> | undefined
    expect(row).toBeUndefined()
  })

  it('throws not_found when relation does not exist', async () => {
    const t1 = await makeTask('T1')
    const t2 = await makeTask('T2')
    await expect(
      removeTaskRelation({ workspace_id: 'ws_1', task_id: t1.task_id, target_task_id: t2.task_id, relation_type: 'blocks' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('getBlockers', () => {
  it('returns tasks that block the given task', async () => {
    const blocker = await makeTask('Blocker')
    const blocked = await makeTask('Blocked')
    await addTaskRelation({ workspace_id: 'ws_1', task_id: blocker.task_id, target_task_id: blocked.task_id, relation_type: 'blocks' })
    const blockers = await getBlockers({ workspace_id: 'ws_1', task_id: blocked.task_id })
    expect(blockers).toHaveLength(1)
    expect(blockers[0].task_id).toBe(blocker.task_id)
  })

  it('returns empty array when task has no blockers', async () => {
    const t = await makeTask('T')
    const blockers = await getBlockers({ workspace_id: 'ws_1', task_id: t.task_id })
    expect(blockers).toHaveLength(0)
  })

  it('returns multiple blockers when several tasks block the same target', async () => {
    const b1 = await makeTask('B1')
    const b2 = await makeTask('B2')
    const target = await makeTask('Target')
    await addTaskRelation({ workspace_id: 'ws_1', task_id: b1.task_id, target_task_id: target.task_id, relation_type: 'blocks' })
    await addTaskRelation({ workspace_id: 'ws_1', task_id: b2.task_id, target_task_id: target.task_id, relation_type: 'blocks' })
    const blockers = await getBlockers({ workspace_id: 'ws_1', task_id: target.task_id })
    expect(blockers).toHaveLength(2)
    const ids = blockers.map(b => b.task_id)
    expect(ids).toContain(b1.task_id)
    expect(ids).toContain(b2.task_id)
  })

  it('does not return blocker relations from another workspace', async () => {
    const db = getDb()
    seedWorkspace(db, 'ws_2', 'proj_2')
    const target = await makeTask('Target')
    const foreignBlocker = await makeTask('Foreign blocker', 'ws_2', 'proj_2')
    db.prepare("INSERT INTO task_relations (task_id, target_task_id, relation_type) VALUES (?, ?, 'blocks')")
      .run(foreignBlocker.task_id, target.task_id)

    const blockers = await getBlockers({ workspace_id: 'ws_1', task_id: target.task_id })
    expect(blockers).toEqual([])
  })
})

describe('getTaskRelations', () => {
  it('returns all relations where task is the source', async () => {
    const t1 = await makeTask('T1')
    const t2 = await makeTask('T2')
    const t3 = await makeTask('T3')
    await addTaskRelation({ workspace_id: 'ws_1', task_id: t1.task_id, target_task_id: t2.task_id, relation_type: 'blocks' })
    await addTaskRelation({ workspace_id: 'ws_1', task_id: t1.task_id, target_task_id: t3.task_id, relation_type: 'relates' })
    const relations = await getTaskRelations({ workspace_id: 'ws_1', task_id: t1.task_id })
    expect(relations).toHaveLength(2)
    const types = relations.map(r => r.relation_type)
    expect(types).toContain('blocks')
    expect(types).toContain('relates')
  })

  it('returns empty array when task has no relations', async () => {
    const t = await makeTask('T')
    const relations = await getTaskRelations({ workspace_id: 'ws_1', task_id: t.task_id })
    expect(relations).toHaveLength(0)
  })

  it('does not return relations to targets in another workspace', async () => {
    const db = getDb()
    seedWorkspace(db, 'ws_2', 'proj_2')
    const source = await makeTask('Source')
    const foreignTarget = await makeTask('Foreign target', 'ws_2', 'proj_2')
    db.prepare("INSERT INTO task_relations (task_id, target_task_id, relation_type) VALUES (?, ?, 'blocks')")
      .run(source.task_id, foreignTarget.task_id)

    const relations = await getTaskRelations({ workspace_id: 'ws_1', task_id: source.task_id })
    expect(relations).toEqual([])
  })
})

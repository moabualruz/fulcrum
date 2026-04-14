import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask, updateTask } from '../tasks.js'
import { buildWorldState } from '../cos-context.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test ws')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','test proj')").run()
}

describe('buildWorldState — return structure', () => {
  it('returns a CoSWorldState with the correct shape', () => {
    seed()
    const db = getDb()
    const result = buildWorldState(db, { workspace_id: 'ws_1', goal: 'test goal' })
    expect(result).toMatchObject({
      goal: 'test goal',
      tasks: {
        backlog: expect.any(Array),
        active: expect.any(Array),
        blocked: expect.any(Array),
        done: expect.any(Array),
      },
      recent_events: expect.any(Array),
      recalled_memories: expect.any(Array),
    })
  })

  it('returns empty arrays when no data exists', () => {
    seed()
    const db = getDb()
    const result = buildWorldState(db, { workspace_id: 'ws_1', goal: 'nothing here' })
    expect(result.tasks.backlog).toHaveLength(0)
    expect(result.tasks.active).toHaveLength(0)
    expect(result.tasks.blocked).toHaveLength(0)
    expect(result.tasks.done).toHaveLength(0)
    expect(result.recalled_memories).toHaveLength(0)
  })
})

describe('buildWorldState — task grouping by status_category', () => {
  it('groups queued tasks into backlog', async () => {
    seed()
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Backlog task' })
    const db = getDb()
    const result = buildWorldState(db, { workspace_id: 'ws_1', goal: 'test' })
    expect(result.tasks.backlog).toHaveLength(1)
    expect(result.tasks.backlog[0].title).toBe('Backlog task')
    expect(result.tasks.active).toHaveLength(0)
  })

  it('groups running tasks into active', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Active task' })
    await updateTask({ task_id: t.task_id, status: 'running' })
    const db = getDb()
    const result = buildWorldState(db, { workspace_id: 'ws_1', goal: 'test' })
    expect(result.tasks.active).toHaveLength(1)
    expect(result.tasks.active[0].title).toBe('Active task')
    expect(result.tasks.backlog).toHaveLength(0)
  })

  it('groups blocked tasks into blocked', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Blocked task' })
    await updateTask({ task_id: t.task_id, status: 'blocked' })
    const db = getDb()
    const result = buildWorldState(db, { workspace_id: 'ws_1', goal: 'test' })
    expect(result.tasks.blocked).toHaveLength(1)
    expect(result.tasks.blocked[0].title).toBe('Blocked task')
  })

  it('groups completed tasks into done', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Done task' })
    await updateTask({ task_id: t.task_id, status: 'completed' })
    const db = getDb()
    const result = buildWorldState(db, { workspace_id: 'ws_1', goal: 'test' })
    expect(result.tasks.done).toHaveLength(1)
    expect(result.tasks.done[0].title).toBe('Done task')
  })

  it('returns task rows with correct fields', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'My task' })
    const db = getDb()
    const result = buildWorldState(db, { workspace_id: 'ws_1', goal: 'test' })
    const row = result.tasks.backlog[0]
    expect(row.task_id).toBe(t.task_id)
    expect(row.display_id).toBe(t.display_id)
    expect(row.title).toBe('My task')
    expect(row.status).toBe('queued')
  })

  it('respects limit_tasks per category', async () => {
    seed()
    for (let i = 0; i < 5; i++) {
      await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: `Task ${i}` })
    }
    const db = getDb()
    const result = buildWorldState(db, { workspace_id: 'ws_1', goal: 'test', limit_tasks: 2 })
    expect(result.tasks.backlog).toHaveLength(2)
  })
})

describe('buildWorldState — recent_events', () => {
  it('includes events for the workspace', async () => {
    seed()
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Task triggers event' })
    const db = getDb()
    const result = buildWorldState(db, { workspace_id: 'ws_1', goal: 'test' })
    expect(result.recent_events.length).toBeGreaterThan(0)
    const evtTypes = result.recent_events.map(e => e.evt_type)
    expect(evtTypes).toContain('task_created')
  })

  it('each event has evt_type, payload, and ts fields', async () => {
    seed()
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Event check task' })
    const db = getDb()
    const result = buildWorldState(db, { workspace_id: 'ws_1', goal: 'test' })
    for (const evt of result.recent_events) {
      expect(evt).toHaveProperty('evt_type')
      expect(evt).toHaveProperty('payload')
      expect(evt).toHaveProperty('ts')
    }
  })

  it('respects limit_events', async () => {
    seed()
    for (let i = 0; i < 5; i++) {
      await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: `Task ${i}` })
    }
    const db = getDb()
    const result = buildWorldState(db, { workspace_id: 'ws_1', goal: 'test', limit_events: 2 })
    expect(result.recent_events).toHaveLength(2)
  })
})

describe('buildWorldState — recalled_memories', () => {
  it('recalls memories when content matches goal snippet', () => {
    seed()
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO memories
        (memory_id, workspace_id, project_id, scope, kind, title, summary, content,
         canonical_text, tags, entities, confidence, embedding,
         task_id, issue_id, artifact_id, provenance_refs,
         created_at, updated_at, last_accessed_at, access_count)
      VALUES ('mem_1', 'ws_1', 'proj_1', 'project', 'fact', 'test', 'test',
              'implement the authentication flow for the API',
              'implement the authentication flow for the API', '[]', '[]', 1.0, NULL, NULL, NULL, NULL, '[]',
              ?, ?, ?, 0)
    `).run(now, now, now)

    const result = buildWorldState(db, {
      workspace_id: 'ws_1',
      goal: 'implement the authentication flow for the API',
    })
    expect(result.recalled_memories).toHaveLength(1)
    expect(result.recalled_memories[0].memory_id).toBe('mem_1')
    expect(result.recalled_memories[0].content).toContain('authentication flow')
    expect(result.recalled_memories[0].kind).toBe('fact')
  })

  it('does not recall memories from other workspaces', () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','ws1')").run()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','ws2')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_ws2','ws_2','p2')").run()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO memories
        (memory_id, workspace_id, project_id, scope, kind, title, summary, content,
         canonical_text, tags, entities, confidence, embedding,
         task_id, issue_id, artifact_id, provenance_refs,
         created_at, updated_at, last_accessed_at, access_count)
      VALUES ('mem_ws2', 'ws_2', 'proj_ws2', 'project', 'fact', 'test', 'test',
              'deploy the service to production',
              NULL, '[]', '[]', 1.0, NULL, NULL, NULL, NULL, '[]',
              ?, ?, ?, 0)
    `).run(now, now, now)

    const result = buildWorldState(db, {
      workspace_id: 'ws_1',
      goal: 'deploy the service to production',
    })
    expect(result.recalled_memories).toHaveLength(0)
  })

  it('returns empty array when no memories match the goal', () => {
    seed()
    const db = getDb()
    const result = buildWorldState(db, {
      workspace_id: 'ws_1',
      goal: 'completely unrelated goal with no matching memories',
    })
    expect(result.recalled_memories).toHaveLength(0)
  })

  it('respects limit_memories', () => {
    seed()
    const db = getDb()
    const now = new Date().toISOString()
    for (let i = 1; i <= 5; i++) {
      db.prepare(`
        INSERT INTO memories
          (memory_id, workspace_id, project_id, scope, kind, title, summary, content,
           canonical_text, tags, entities, confidence, embedding,
           task_id, issue_id, artifact_id, provenance_refs,
           created_at, updated_at, last_accessed_at, access_count)
        VALUES (?, 'ws_1', 'proj_1', 'project', 'fact', 'test', 'test',
                'build authentication system part ' || ?,
                NULL, '[]', '[]', 1.0, NULL, NULL, NULL, NULL, '[]',
                ?, ?, ?, 0)
      `).run(`mem_${i}`, i, now, now, now)
    }

    const result = buildWorldState(db, {
      workspace_id: 'ws_1',
      goal: 'build authentication system',
      limit_memories: 2,
    })
    expect(result.recalled_memories).toHaveLength(2)
  })
})

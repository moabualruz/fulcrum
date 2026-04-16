// packages/memory/src/tests/getmemory.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from '@moabualruz/fulcrum-core'
import { writeMemory } from '../write.js'
import { getMemory, getMemoriesForTask } from '../recall.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

// ── getMemory ─────────────────────────────────────────────────────────────────

describe('getMemory', () => {
  it('returns the FullMemory for a valid memory_id including importance', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const written = await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'project',
      kind: 'fact',
      title: 'Test memory',
      summary: 'A test memory',
      content: 'Full content here',
      importance: 0.8,
    })
    const result = await getMemory(written.memory_id)
    expect(result).not.toBeNull()
    expect(result!.memory_id).toBe(written.memory_id)
    expect(result!.title).toBe('Test memory')
    expect(result!.summary).toBe('A test memory')
    expect(result!.importance).toBe(0.8)
    // Confirm it's a FullMemory (has canonical_text and access_count fields)
    expect(result).toHaveProperty('canonical_text')
    expect(result).toHaveProperty('access_count')
    expect(result).toHaveProperty('tags')
    expect(result).toHaveProperty('entities')
    expect(result).toHaveProperty('provenance_refs')
  })

  it('returns null for an unknown memory_id', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const result = await getMemory('mem_nonexistent_999')
    expect(result).toBeNull()
  })
})

// ── getMemoriesForTask ────────────────────────────────────────────────────────

describe('getMemoriesForTask', () => {
  it('returns memories for a task sorted newest first', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    db.prepare("INSERT OR IGNORE INTO tasks(task_id, workspace_id, project_id, title, status) VALUES ('task_1', 'ws_1', 'proj_1', 'Task One', 'queued')").run()

    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'project',
      kind: 'fact',
      title: 'First task memory',
      summary: 'summary 1',
      content: 'content 1',
      task_id: 'task_1',
    })
    // Small sleep to ensure distinct created_at timestamps
    await new Promise(r => setTimeout(r, 10))
    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'project',
      kind: 'decision',
      title: 'Second task memory',
      summary: 'summary 2',
      content: 'content 2',
      task_id: 'task_1',
    })

    const results = await getMemoriesForTask('task_1')
    expect(results).toHaveLength(2)
    // Sorted newest first (created_at DESC)
    expect(results[0].title).toBe('Second task memory')
    expect(results[1].title).toBe('First task memory')
    // All belong to the correct task
    for (const m of results) {
      expect(m.task_id).toBe('task_1')
    }
  })

  it('returns empty array when task has no memories', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const results = await getMemoriesForTask('task_nonexistent')
    expect(results).toEqual([])
  })

  it('only returns memories for the specified task_id', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    db.prepare("INSERT OR IGNORE INTO tasks(task_id, workspace_id, project_id, title, status) VALUES ('task_a', 'ws_1', 'proj_1', 'Task A', 'queued')").run()
    db.prepare("INSERT OR IGNORE INTO tasks(task_id, workspace_id, project_id, title, status) VALUES ('task_b', 'ws_1', 'proj_1', 'Task B', 'queued')").run()

    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'project',
      kind: 'fact',
      title: 'Memory for A',
      summary: 's',
      content: 'belongs to task A',
      task_id: 'task_a',
    })
    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'project',
      kind: 'fact',
      title: 'Memory for B',
      summary: 's',
      content: 'belongs to task B',
      task_id: 'task_b',
    })
    // Memory with no task
    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'project',
      kind: 'fact',
      title: 'Unlinked memory',
      summary: 's',
      content: 'no task linked',
    })

    const results = await getMemoriesForTask('task_a')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Memory for A')
    expect(results[0].task_id).toBe('task_a')
  })
})

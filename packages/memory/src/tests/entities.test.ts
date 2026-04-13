// packages/memory/src/tests/entities.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from '@fulcrum/core'
import { writeMemory } from '../write.js'
import { linkMemoryToEntity, getMemoryEntities } from '../entities.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

async function seedMemory(db: ReturnType<typeof getDb>): Promise<string> {
  seedWorkspaceAndProject(db)
  const m = await writeMemory({
    workspace_id: 'ws_1', project_id: 'proj_1',
    scope: 'project', kind: 'fact', title: 't', summary: 's', content: 'content',
  })
  return m.memory_id
}

describe('linkMemoryToEntity', () => {
  it('creates a memory_entity link with default relation_type', async () => {
    const db = getDb()
    const memory_id = await seedMemory(db)
    await linkMemoryToEntity({ memory_id, entity_type: 'task', entity_id: 'task_123' })
    const row = db.prepare('SELECT * FROM memory_entities WHERE memory_id = ?').get(memory_id) as Record<string, unknown>
    expect(row.entity_type).toBe('task')
    expect(row.entity_id).toBe('task_123')
    expect(row.relation_type).toBe('subject_of')
  })

  it('supports custom relation_type', async () => {
    const db = getDb()
    const memory_id = await seedMemory(db)
    await linkMemoryToEntity({ memory_id, entity_type: 'issue', entity_id: 'iss_1', relation_type: 'derived_from' })
    const row = db.prepare('SELECT relation_type FROM memory_entities WHERE memory_id = ?').get(memory_id) as { relation_type: string }
    expect(row.relation_type).toBe('derived_from')
  })

  it('is idempotent — does not throw on duplicate link', async () => {
    const db = getDb()
    const memory_id = await seedMemory(db)
    await linkMemoryToEntity({ memory_id, entity_type: 'task', entity_id: 'task_123' })
    await expect(
      linkMemoryToEntity({ memory_id, entity_type: 'task', entity_id: 'task_123' })
    ).resolves.not.toThrow()
    const count = (db.prepare('SELECT COUNT(*) as c FROM memory_entities WHERE memory_id = ?').get(memory_id) as { c: number }).c
    expect(count).toBe(1)
  })

  it('throws not_found for a non-existent memory_id', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await expect(
      linkMemoryToEntity({ memory_id: 'mem_NONEXISTENT', entity_type: 'task', entity_id: 'task_1' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('getMemoryEntities', () => {
  it('returns all entity links for a memory', async () => {
    const db = getDb()
    const memory_id = await seedMemory(db)
    await linkMemoryToEntity({ memory_id, entity_type: 'task', entity_id: 'task_1' })
    await linkMemoryToEntity({ memory_id, entity_type: 'issue', entity_id: 'iss_1' })
    const entities = await getMemoryEntities(memory_id)
    expect(entities).toHaveLength(2)
    expect(entities.map(e => e.entity_type).sort()).toEqual(['issue', 'task'])
  })

  it('returns empty array for a memory with no links', async () => {
    const db = getDb()
    const memory_id = await seedMemory(db)
    const entities = await getMemoryEntities(memory_id)
    expect(entities).toEqual([])
  })

  it('does not return links from other memories', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const m1 = await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'fact', title: 't1', summary: 's', content: 'content1' })
    const m2 = await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'fact', title: 't2', summary: 's', content: 'content2' })
    await linkMemoryToEntity({ memory_id: m1.memory_id, entity_type: 'task', entity_id: 'task_1' })
    const entities = await getMemoryEntities(m2.memory_id)
    expect(entities).toHaveLength(0)
  })
})

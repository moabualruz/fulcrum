import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { writeMemory, recallMemory } from '../memory.js'

beforeEach(() => createTestDb())
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test',datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test',datetime('now'))").run()
}

describe('writeMemory', () => {
  it('persists a memory and returns it', async () => {
    seed()
    const m = await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content: 'We chose SQLite over Postgres because local-first is the priority',
      tags: ['architecture', 'database'],
    })
    expect(m.memory_id).toMatch(/^[0-9A-Z]{26}$/)
    expect(m.content).toBe('We chose SQLite over Postgres because local-first is the priority')
    expect(m.tags).toEqual(['architecture', 'database'])
    expect(m.confidence).toBe(1.0)
    expect(m.access_count).toBe(0)
  })

  it('deduplicates: updates existing memory when content is near-identical', async () => {
    seed()
    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content: 'SQLite is used for local-first storage',
    })
    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content: 'SQLite is used for local-first storage', // exact duplicate
    })
    const db = getDb()
    const count = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c
    expect(count).toBe(1) // should deduplicate
  })
})

describe('recallMemory', () => {
  it('returns memories matching a query via FTS5', async () => {
    seed()
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'SQLite is the database' })
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'pnpm manages the workspace' })
    const results = await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'database', limit: 5 })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].content).toContain('SQLite')
  })

  it('increments access_count on recall', async () => {
    seed()
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'important decision' })
    await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'important', limit: 5 })
    const db = getDb()
    const m = db.prepare('SELECT access_count FROM memories').get() as { access_count: number }
    expect(m.access_count).toBe(1)
  })

  it('returns empty array for no matches', async () => {
    seed()
    const results = await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'zzznomatch', limit: 5 })
    expect(results).toEqual([])
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { writeMemory, recallMemory } from '../memory.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','test')").run()
}

describe('writeMemory — input validation', () => {
  it('throws invalid_input for empty content', async () => {
    seed()
    await expect(
      writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: '' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('throws invalid_input for whitespace-only content', async () => {
    seed()
    await expect(
      writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: '   ' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('throws invalid_input for confidence > 1', async () => {
    seed()
    await expect(
      writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'test', confidence: 1.5 })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('throws invalid_input for confidence < 0', async () => {
    seed()
    await expect(
      writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'test', confidence: -0.1 })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

describe('recallMemory — input validation', () => {
  it('throws invalid_input for empty query', async () => {
    seed()
    await expect(
      recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: '' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

describe('writeMemory', () => {
  it('persists a memory and returns it', async () => {
    seed()
    const m = await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content: 'We chose SQLite over Postgres because local-first is the priority',
      tags: ['architecture', 'database'],
    })
    expect(m.memory_id).toMatch(/^mem_[0-9A-Z]{26}$|^[0-9A-Z]{26}$/)
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

describe('recallMemory — cross-workspace isolation', () => {
  it('does not return memories from a different workspace', async () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','ws1')").run()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','ws2')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','p1')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_2','p2')").run()

    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'secret for ws_1 only' })
    const results = await recallMemory({ workspace_id: 'ws_2', project_id: 'proj_2', query: 'secret', limit: 5 })
    expect(results).toHaveLength(0)
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
    const m = await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'important decision' })
    await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'important', limit: 5 })
    const db = getDb()
    const row = db.prepare('SELECT access_count FROM memories WHERE memory_id = ?').get(m.memory_id) as { access_count: number }
    expect(row.access_count).toBe(1)
  })

  it('returns empty array for no matches', async () => {
    seed()
    const results = await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'zzznomatch', limit: 5 })
    expect(results).toEqual([])
  })

  it('defaults to limit 5 when not specified', async () => {
    seed()
    for (let i = 1; i <= 7; i++) {
      await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: `SQLite fact number ${i}` })
    }
    const results = await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'SQLite' })
    expect(results.length).toBeLessThanOrEqual(5)
    expect(results.length).toBeGreaterThan(0)
  })

  it('respects limit — returns at most N results', async () => {
    seed()
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'SQLite is the database engine' })
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'SQLite uses WAL mode' })
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'SQLite supports FTS5 full-text search' })
    const results = await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'SQLite', limit: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('returns empty array for limit 0', async () => {
    seed()
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'SQLite is the database' })
    const results = await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'SQLite', limit: 0 })
    expect(results).toEqual([])
  })
})

describe('recallMemory — FTS5 fallback', () => {
  it('does not throw when query contains FTS5 special characters, returns results via LIKE fallback', async () => {
    seed()
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'SQLite full text search' })
    // Unclosed quote is a valid FTS5 syntax error trigger
    const results = await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: '"SQLite', limit: 5 })
    expect(Array.isArray(results)).toBe(true)
  })
})

describe('writeMemory — deduplication behaviour', () => {
  it('exact dedup updates confidence but preserves original tags', async () => {
    seed()
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'same content', tags: ['original'] })
    const updated = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1', content: 'same content',
      tags: ['ignored'], confidence: 0.8,
    })
    // Tags are NOT updated on exact dedup — confidence is
    expect(updated.confidence).toBe(0.8)
    expect(updated.tags).toEqual(['original'])
  })
})

describe('writeMemory — scope, kind, title, summary', () => {
  it('defaults scope to project', async () => {
    seed()
    const m = await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'A fact about the project' })
    expect(m.scope).toBe('project')
  })

  it('defaults kind to fact', async () => {
    seed()
    const m = await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'Some content here' })
    expect(m.kind).toBe('fact')
  })

  it('defaults title to first 80 chars of content', async () => {
    seed()
    const content = 'This is a memory with some content that is more than 80 characters in total length for testing'
    const m = await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content })
    expect(m.title).toBe(content.slice(0, 80))
  })

  it('defaults summary to title', async () => {
    seed()
    const m = await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'Short content' })
    expect(m.summary).toBe(m.title)
  })

  it('accepts explicit scope, kind, title, summary', async () => {
    seed()
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      content: 'Detailed content here',
      scope: 'global', kind: 'decision',
      title: 'Custom title', summary: 'Custom summary',
    })
    expect(m.scope).toBe('global')
    expect(m.kind).toBe('decision')
    expect(m.title).toBe('Custom title')
    expect(m.summary).toBe('Custom summary')
  })
})

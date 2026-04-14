// packages/memory/src/tests/recall.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from '@fulcrum/core'
import { writeMemory } from '../write.js'
import { recallMemory } from '../recall.js'
import type { FullMemory } from '../types.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

async function seedMemories(db: ReturnType<typeof getDb>): Promise<void> {
  seedWorkspaceAndProject(db)
  await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'fact',     title: 'SQLite choice',    summary: 'database decision',       content: 'We chose SQLite for local-first storage' })
  await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'decision', title: 'pnpm workspaces',  summary: 'monorepo tooling choice', content: 'pnpm manages the monorepo workspace' })
  await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'file',    kind: 'symbol',   title: 'getDb function',   summary: 'db accessor',             content: 'getDb returns the singleton database connection', file_path: 'src/db/client.ts', symbol_path: 'getDb' })
}

// ── compact mode ──────────────────────────────────────────────────────────────

describe('recallMemory — compact mode (default)', () => {
  it('returns CompactMemory[] with only the slim fields', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'SQLite' })
    expect(results.length).toBeGreaterThan(0)
    const first = results[0] as unknown as Record<string, unknown>
    // compact mode must have these fields
    expect(first).toHaveProperty('memory_id')
    expect(first).toHaveProperty('title')
    expect(first).toHaveProperty('summary')
    expect(first).toHaveProperty('scope')
    expect(first).toHaveProperty('kind')
    expect(first).toHaveProperty('confidence')
    // compact mode must NOT have canonical_text
    expect(first).not.toHaveProperty('canonical_text')
    expect(first).not.toHaveProperty('access_count')
  })

  it('default limit is 8', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    for (let i = 1; i <= 12; i++) {
      await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'fact', title: `fact ${i}`, summary: 's', content: `SQLite fact number ${i}` })
    }
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'SQLite' })
    expect(results.length).toBeLessThanOrEqual(8)
    expect(results.length).toBeGreaterThan(0)
  })

  it('respects custom limit', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'the', limit: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('returns empty array for no matches', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'zzznomatch_xyz' })
    expect(results).toEqual([])
  })

  it('throws invalid_input for empty query', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await expect(recallMemory({ workspace_id: 'ws_1', query: '' }))
      .rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('cross-workspace isolation — does not return results from other workspace', async () => {
    const db = getDb()
    db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id,name) VALUES ('ws_1','ws1')").run()
    db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id,name) VALUES ('ws_2','ws2')").run()
    db.prepare("INSERT OR IGNORE INTO projects(project_id,workspace_id,name) VALUES ('proj_1','ws_1','p1')").run()
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'fact', title: 'secret', summary: 's', content: 'secret ws_1 data' })
    const results = await recallMemory({ workspace_id: 'ws_2', query: 'secret' })
    expect(results).toHaveLength(0)
  })

  it('filters by scope when provided', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'the', scope: 'file' })
    for (const r of results) {
      expect((r as unknown as Record<string, unknown>).scope).toBe('file')
    }
  })

  it('filters by kind when provided', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'the', kind: 'decision' })
    for (const r of results) {
      expect((r as unknown as Record<string, unknown>).kind).toBe('decision')
    }
  })

  it('FTS5 fallback — does not throw for special characters, returns array', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: '"SQLite' })
    expect(Array.isArray(results)).toBe(true)
  })

  it('increments access_count for recalled memories', async () => {
    const db = getDb()
    await seedMemories(db)
    await recallMemory({ workspace_id: 'ws_1', query: 'SQLite' })
    const rows = db.prepare('SELECT access_count FROM memories WHERE content LIKE ?').all('%SQLite%') as { access_count: number }[]
    const incremented = rows.filter(r => r.access_count > 0)
    expect(incremented.length).toBeGreaterThan(0)
  })
})

// ── total_ranked mode ─────────────────────────────────────────────────────────

describe('recallMemory — total_ranked mode', () => {
  it('returns FullMemory with canonical_text field present', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'SQLite', mode: 'total_ranked' })
    expect(results.length).toBeGreaterThan(0)
    const first = results[0] as unknown as Record<string, unknown>
    expect(first).toHaveProperty('canonical_text')
    expect(first).toHaveProperty('access_count')
    expect(first).toHaveProperty('tags')
    expect(first).toHaveProperty('entities')
    expect(first).toHaveProperty('provenance_refs')
  })

  it('default limit is 20 for total_ranked', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    for (let i = 1; i <= 25; i++) {
      await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'fact', title: `f${i}`, summary: 's', content: `SQLite ranked fact ${i}` })
    }
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'SQLite ranked', mode: 'total_ranked' })
    expect(results.length).toBeLessThanOrEqual(20)
    expect(results.length).toBeGreaterThan(0)
  })
})

// ── total_timeline mode ───────────────────────────────────────────────────────

describe('recallMemory — total_timeline mode', () => {
  it('returns results sorted by event_time ASC, null last', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'fact', title: 'middle', summary: 's', content: 'SQLite timeline test', event_time: '2025-06-01T00:00:00Z' })
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'fact', title: 'first',  summary: 's', content: 'SQLite timeline early', event_time: '2025-01-01T00:00:00Z' })
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'fact', title: 'no time', summary: 's', content: 'SQLite timeline no event' })
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'SQLite timeline', mode: 'total_timeline' })
    expect(results.length).toBeGreaterThan(0)
    // Null event_time entries should come last
    const eventTimes = (results as FullMemory[]).map(r => r.event_time)
    const nonNullIdx = eventTimes.findIndex(t => t !== null)
    const nullIdx = eventTimes.findIndex(t => t === null)
    if (nonNullIdx !== -1 && nullIdx !== -1) {
      expect(nullIdx).toBeGreaterThan(nonNullIdx)
    }
    // Non-null entries should be in ascending order
    const nonNull = eventTimes.filter((t): t is string => t !== null)
    for (let i = 1; i < nonNull.length; i++) {
      expect(nonNull[i] >= nonNull[i - 1]).toBe(true)
    }
  })
})

// ── total_sourcemap mode ──────────────────────────────────────────────────────

describe('recallMemory — total_sourcemap mode', () => {
  it('returns results sorted by file_path ASC, symbol_path ASC', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'file', kind: 'symbol', title: 'z fn', summary: 's', content: 'getDb function details', file_path: 'src/z.ts', symbol_path: 'zFn' })
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'file', kind: 'symbol', title: 'a fn', summary: 's', content: 'getDb other function', file_path: 'src/a.ts', symbol_path: 'aFn' })
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'getDb', mode: 'total_sourcemap' })
    expect(results.length).toBeGreaterThan(0)
    const filePaths = (results as FullMemory[]).map(r => r.file_path).filter(Boolean)
    for (let i = 1; i < filePaths.length; i++) {
      expect((filePaths[i] as string) >= (filePaths[i - 1] as string)).toBe(true)
    }
  })
})

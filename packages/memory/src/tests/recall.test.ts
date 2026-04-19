// packages/memory/src/tests/recall.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { writeMemory } from '../write.js'
import { recallMemory } from '../recall.js'
import { rrfFuse } from '../scoring.js'
import type { FullMemory, CompactMemory } from '../types.js'

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
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'SQLite' }) as unknown as CompactMemory[]
    expect(Array.isArray(results) ? results.length : 0).toBeGreaterThan(0)
    const first = results[0] as unknown as Record<string, unknown>
    // compact mode must have these fields
    expect(first).toHaveProperty('memory_id')
    expect(first).toHaveProperty('title')
    expect(first).toHaveProperty('summary')
    expect(first).toHaveProperty('scope')
    expect(first).toHaveProperty('kind')
    expect(first).toHaveProperty('confidence')
    // compact mode must NOT have access_count (full-mode only). canonical_text
    // was retired in PR 9.3 — absent from every mode now.
    expect(first).not.toHaveProperty('canonical_text')
    expect(first).not.toHaveProperty('access_count')
  })

  it('default limit is 8', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    for (let i = 1; i <= 12; i++) {
      await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', scope: 'project', kind: 'fact', title: `fact ${i}`, summary: 's', content: `SQLite fact number ${i}` })
    }
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'SQLite' }) as unknown as CompactMemory[]
    expect(results.length).toBeLessThanOrEqual(8)
    expect(results.length).toBeGreaterThan(0)
  })

  it('respects custom limit', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'the', limit: 2 }) as unknown as CompactMemory[]
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('returns empty array for no matches', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'zzznomatch_xyz' }) as unknown as CompactMemory[]
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
    const results = await recallMemory({ workspace_id: 'ws_2', query: 'secret' }) as unknown as CompactMemory[]
    expect(results).toHaveLength(0)
  })

  it('filters by scope when provided', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'the', scope: 'file' }) as unknown as CompactMemory[]
    for (const r of results) {
      expect((r as unknown as Record<string, unknown>).scope).toBe('file')
    }
  })

  it('filters by kind when provided', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'the', kind: 'decision' }) as unknown as CompactMemory[]
    for (const r of results) {
      expect((r as unknown as Record<string, unknown>).kind).toBe('decision')
    }
  })

  it('FTS5 fallback — does not throw for special characters, returns array', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: '"SQLite' }) as unknown as CompactMemory[]
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
  it('returns FullMemory with full-mode fields present (PR 9.3 retired canonical_text)', async () => {
    const db = getDb()
    await seedMemories(db)
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'SQLite', mode: 'total_ranked' }) as unknown as CompactMemory[]
    expect(results.length).toBeGreaterThan(0)
    const first = results[0] as unknown as Record<string, unknown>
    expect(first).not.toHaveProperty('canonical_text')
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
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'SQLite ranked', mode: 'total_ranked' }) as unknown as CompactMemory[]
    expect(results.length).toBeLessThanOrEqual(20)
    expect(results.length).toBeGreaterThan(0)
  })
})

// ── RRF fusion (rrfFuse unit tests) ───────────────────────────────────────────

describe('rrfFuse — hybrid result fusion', () => {
  it('merges two lists and returns items from both', () => {
    const listA = [
      { memory_id: 'a1', title: 'alpha one' },
      { memory_id: 'a2', title: 'alpha two' },
    ]
    const listB = [
      { memory_id: 'b1', title: 'beta one' },
      { memory_id: 'b2', title: 'beta two' },
    ]
    const fused = rrfFuse(listA, listB)
    const ids = fused.map(x => x.memory_id)
    expect(ids).toContain('a1')
    expect(ids).toContain('a2')
    expect(ids).toContain('b1')
    expect(ids).toContain('b2')
    expect(fused).toHaveLength(4)
  })

  it('items appearing in both lists rank higher than items in only one list', () => {
    // shared is rank 1 in listA, rank 1 in listB — should outscore solo items
    const shared = { memory_id: 'shared', title: 'shared item' }
    const onlyA  = { memory_id: 'onlyA',  title: 'only in A' }
    const onlyB  = { memory_id: 'onlyB',  title: 'only in B' }
    const listA = [shared, onlyA]
    const listB = [shared, onlyB]
    const fused = rrfFuse(listA, listB)
    expect(fused[0].memory_id).toBe('shared')
  })

  it('gracefully handles empty listB (FTS5-only degradation)', () => {
    const listA = [
      { memory_id: 'a1', title: 'alpha one' },
      { memory_id: 'a2', title: 'alpha two' },
    ]
    const fused = rrfFuse(listA, [])
    // All items from listA should appear; order preserved (both have same absent-B penalty)
    expect(fused.map(x => x.memory_id)).toEqual(expect.arrayContaining(['a1', 'a2']))
    expect(fused).toHaveLength(2)
  })
})

// ── hybrid graceful degradation via recall pipeline ───────────────────────────

describe('recallMemory — hybrid graceful degradation', () => {
  it('returns FTS5 results when no embedder is configured (vector search absent)', async () => {
    const db = getDb()
    await seedMemories(db)
    // No embedder registered in test environment — recall must still return FTS5 hits
    const results = await recallMemory({ workspace_id: 'ws_1', query: 'SQLite' }) as unknown as CompactMemory[]
    expect(Array.isArray(results) ? results.length : 0).toBeGreaterThan(0)
  })
})

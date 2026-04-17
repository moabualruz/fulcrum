import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb } from 'fulcrum-core'
import { runMigrations } from 'fulcrum-core'
import { writeMemory } from '../write.js'
import { runStagedSearch } from '../retrieval/search.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

async function seedMemory(db: Database.Database, partial: { content: string; title: string; tags?: string[] }) {
  return writeMemory({
    workspace_id: 'ws_1',
    project_id: 'proj_1',
    scope: 'project',
    kind: 'decision',
    title: partial.title,
    summary: '',
    content: partial.content,
    tags: partial.tags ?? [],
    skipVaultWrite: true,
  } as Parameters<typeof writeMemory>[0], db)
}

describe('runStagedSearch — v2a PR 2 envelope contract', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')`).run()
  })
  afterEach(() => closeDb())

  it('returns reason=no_match when corpus is empty', async () => {
    const out = await runStagedSearch({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'anything',
    })
    expect(out.results).toEqual([])
    expect(out.reason).toBe('no_match')
  })

  it('returns reason=below_floor when results exist but all score below min_score', async () => {
    await seedMemory(db, { content: 'unrelated content about astronomy', title: 'astro' })
    const out = await runStagedSearch({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'database queries',
      min_score: 0.99,
    })
    // Either no_match (no FTS overlap) or below_floor (some overlap, all under 0.99)
    expect(out.results).toEqual([])
    expect(['no_match', 'below_floor']).toContain(out.reason)
  })

  it('returns results without reason when matches exceed min_score', async () => {
    await seedMemory(db, { content: 'database query optimization for sqlite', title: 'sqlite-opt' })
    await seedMemory(db, { content: 'another database tip on indexing', title: 'index-tip' })
    const out = await runStagedSearch({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'database',
      min_score: 0,
    })
    expect(out.results.length).toBeGreaterThan(0)
    expect(out.reason).toBeUndefined()
  })

  it('inserts a memory_recall_events row per surviving result', async () => {
    await seedMemory(db, { content: 'sqlite indexing strategy', title: 'sqlite' })
    const before = (db.prepare('SELECT COUNT(*) AS n FROM memory_recall_events').get() as { n: number }).n
    const out = await runStagedSearch({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'sqlite',
      min_score: 0,
      caller_run_id: 'run_xyz',
      caller_role: 'software_engineer',
    })
    expect(out.results.length).toBeGreaterThan(0)
    const after = (db.prepare('SELECT COUNT(*) AS n FROM memory_recall_events').get() as { n: number }).n
    expect(after).toBe(before + out.results.length)

    const row = db.prepare(`SELECT memory_id, query, source, caller_run_id, caller_role FROM memory_recall_events ORDER BY id DESC LIMIT 1`).get() as { memory_id: string; query: string; source: string; caller_run_id: string; caller_role: string }
    expect(row.query).toBe('sqlite')
    expect(row.source).toBe('recall_memory')
    expect(row.caller_run_id).toBe('run_xyz')
    expect(row.caller_role).toBe('software_engineer')
  })

  it('honors recall_source override (e.g. query_memory or search_code)', async () => {
    await seedMemory(db, { content: 'foo content for source override test', title: 'foo' })
    await runStagedSearch({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'foo',
      min_score: 0,
      recall_source: 'query_memory',
    })
    const sources = (db.prepare(`SELECT DISTINCT source FROM memory_recall_events`).all() as { source: string }[]).map(r => r.source)
    expect(sources).toContain('query_memory')
  })

  it('default min_score: single-token query → 0 (FTS-only floor)', async () => {
    await seedMemory(db, { content: 'foo', title: 'foo' })
    const out = await runStagedSearch({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'foo',
    })
    expect(out.results.length).toBeGreaterThan(0)
  })

  it('default min_score: multi-token query → 0.35 (semantic floor); below-floor surfaces reason', async () => {
    await seedMemory(db, { content: 'apple banana cherry', title: 'fruits' })
    const out = await runStagedSearch({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'extremely unrelated topic',
    })
    expect(out.results).toEqual([])
    expect(['no_match', 'below_floor']).toContain(out.reason)
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb } from 'fulcrum-agent-core'
import { runMigrations } from 'fulcrum-agent-core'
import { searchCode } from '../retrieval/search-code.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

describe('searchCode — v2a PR 2 Task 13', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')`).run()
  })
  afterEach(() => closeDb())

  function seedChunk(opts: { chunk_id: string; file_path: string; content: string; symbol_path?: string; language?: string }) {
    db.prepare(`INSERT INTO code_chunks (chunk_id, workspace_id, project_id, file_path, language, chunk_strategy, source_type, content, start_line, end_line, symbol_path, indexed_at)
                VALUES (?, 'ws_1', 'proj_1', ?, ?, 'syntax', 'code', ?, 1, 10, ?, '2026-04-17T00:00:00Z')`)
      .run(opts.chunk_id, opts.file_path, opts.language ?? 'typescript', opts.content, opts.symbol_path ?? null)
  }

  it('reason=no_match on empty corpus', async () => {
    const out = await searchCode({ workspace_id: 'ws_1', project_id: 'proj_1', text: 'foo' })
    expect(out.results).toEqual([])
    expect(out.reason).toBe('no_match')
  })

  it('FTS text match finds chunks', async () => {
    seedChunk({ chunk_id: 'c1', file_path: 'src/a.ts', content: 'export function authenticateUser(token: string) {}' })
    seedChunk({ chunk_id: 'c2', file_path: 'src/b.ts', content: 'const colors = ["red", "green"]' })
    const out = await searchCode({ workspace_id: 'ws_1', project_id: 'proj_1', text: 'authenticateUser' })
    expect(out.results.length).toBeGreaterThan(0)
    expect(out.results[0]!.rel_path).toBe('src/a.ts')
  })

  it('symbol filter matches symbol_path exactly', async () => {
    seedChunk({ chunk_id: 'c1', file_path: 'src/a.ts', content: 'foo', symbol_path: 'auth.login' })
    seedChunk({ chunk_id: 'c2', file_path: 'src/b.ts', content: 'bar', symbol_path: 'auth.logout' })
    const out = await searchCode({ workspace_id: 'ws_1', project_id: 'proj_1', symbol: 'auth.login' })
    expect(out.results).toHaveLength(1)
    expect(out.results[0]!.symbol_path).toBe('auth.login')
  })

  it('lang + path filters compose', async () => {
    seedChunk({ chunk_id: 'c1', file_path: 'src/a.ts', content: 'foo', language: 'typescript' })
    seedChunk({ chunk_id: 'c2', file_path: 'src/b.py', content: 'foo', language: 'python' })
    const out = await searchCode({ workspace_id: 'ws_1', project_id: 'proj_1', lang: 'python', path: 'src/' })
    expect(out.results).toHaveLength(1)
    expect(out.results[0]!.language).toBe('python')
  })

  it('does not insert memory_recall_events by default', async () => {
    seedChunk({ chunk_id: 'c1', file_path: 'src/a.ts', content: 'authenticate' })
    await searchCode({ workspace_id: 'ws_1', project_id: 'proj_1', text: 'authenticate' })
    const sources = (db.prepare(`SELECT DISTINCT source FROM memory_recall_events`).all() as { source: string }[]).map(r => r.source)
    expect(sources).not.toContain('search_code')
  })

  it('persists memory_recall_events only when explicitly requested', async () => {
    seedChunk({ chunk_id: 'c1', file_path: 'src/a.ts', content: 'authenticate' })
    await searchCode({ workspace_id: 'ws_1', project_id: 'proj_1', text: 'authenticate', persist: true })
    const sources = (db.prepare(`SELECT DISTINCT source FROM memory_recall_events`).all() as { source: string }[]).map(r => r.source)
    expect(sources).toContain('search_code')
  })

  it('honors min_score floor', async () => {
    seedChunk({ chunk_id: 'c1', file_path: 'src/a.ts', content: 'authenticate' })
    // RRF scores are ~1/(60+rank); rank-1 FTS match yields ~0.0164.
    // A floor of 0.001 lets rank-1 hits through; a floor of 0.5 rejects them.
    const out = await searchCode({ workspace_id: 'ws_1', project_id: 'proj_1', text: 'authenticate', min_score: 0.001 })
    expect(out.results.length).toBeGreaterThan(0)
    const out2 = await searchCode({ workspace_id: 'ws_1', project_id: 'proj_1', text: 'authenticate', min_score: 0.5 })
    expect(out2.results).toEqual([])
    expect(out2.reason).toBe('below_floor')
  })

  it('does not return orphaned chunks with missing file rows', async () => {
    db.prepare(`
      INSERT INTO code_chunks (
        chunk_id, workspace_id, project_id, file_path, file_id, language,
        chunk_strategy, source_type, content, start_line, end_line, symbol_path, indexed_at
      ) VALUES (
        'c_orphan', 'ws_1', 'proj_1', 'src/orphan.ts', 'missing_file', 'typescript',
        'syntax', 'code', 'orphan marker token', 1, 1, NULL, '2026-04-17T00:00:00Z'
      )
    `).run()

    const out = await searchCode({ workspace_id: 'ws_1', project_id: 'proj_1', text: 'orphan marker' })
    expect(out.results).toEqual([])
    expect(out.reason).toBe('no_match')
  })
})

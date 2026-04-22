import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { searchCode } from '../retrieval/search-code.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

describe('searchCode explain output', () => {
  let db: Database.Database

  beforeEach(() => {
    db = freshDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_code_exp','w','active','2026-04-22T00:00:00Z')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_code_exp','ws_code_exp','p','git','active','worktree','2026-04-22T00:00:00Z')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_code_other','ws_code_exp','other','git','active','worktree','2026-04-22T00:00:00Z')").run()
  })

  afterEach(() => closeDb())

  function seedChunk(): void {
    db.prepare(
      `INSERT INTO code_chunks (
         chunk_id, workspace_id, project_id, file_path, language, chunk_strategy,
         source_type, content, start_line, end_line, symbol_path, indexed_at
       ) VALUES (
         'chunk_exp_1', 'ws_code_exp', 'proj_code_exp', 'src/auth.ts', 'typescript',
         'syntax', 'code', 'export function authenticateUser(token: string) { return token.length > 0 }',
         12, 14, 'auth.authenticateUser', '2026-04-22T00:00:00Z'
       )`,
    ).run()
  }

  function seedOtherProjectChunk(): void {
    db.prepare(
      `INSERT INTO code_chunks (
         chunk_id, workspace_id, project_id, file_path, language, chunk_strategy,
         source_type, content, start_line, end_line, symbol_path, indexed_at
       ) VALUES (
         'chunk_exp_other', 'ws_code_exp', 'proj_code_other', 'src/other-auth.ts', 'typescript',
         'syntax', 'code', 'export function authenticateUser(token: string) { return Boolean(token) }',
         4, 6, 'other.authenticateUser', '2026-04-22T00:00:00Z'
       )`,
    ).run()
  }

  it('includes code-backed explanation with stable path and line source reference', async () => {
    seedChunk()

    const out = await searchCode({
      workspace_id: 'ws_code_exp',
      project_id: 'proj_code_exp',
      text: 'authenticateUser',
      explain: true,
    })

    expect(out.results).toHaveLength(1)
    const result = out.results[0]!
    expect(result.rel_path).toBe('src/auth.ts')
    expect(result.start_line).toBe(12)
    expect(result.end_line).toBe(14)
    expect(result.explanation).toMatchObject({
      result_id: 'chunk_exp_1',
      result_type: 'code_chunk',
      stage_ranks: {
        fts: 1,
        symbol: null,
      },
      stage_scores: {
        fts: expect.any(Number),
        symbol: null,
        fused: expect.any(Number),
      },
      trust: {
        provenance_class: 'code-backed',
        confidence: null,
        freshness: null,
        supersession: 'current',
      },
      sources: [
        {
          kind: 'code',
          chunk_id: 'chunk_exp_1',
          path: 'src/auth.ts',
          start_line: 12,
          end_line: 14,
          status: 'resolved',
        },
      ],
    })
  })

  it('ranks FTS explanation within the requested project scope', async () => {
    seedOtherProjectChunk()
    seedChunk()

    const out = await searchCode({
      workspace_id: 'ws_code_exp',
      project_id: 'proj_code_exp',
      text: 'authenticateUser',
      explain: true,
    })

    expect(out.results).toHaveLength(1)
    expect(out.results[0]!.chunk_id).toBe('chunk_exp_1')
    expect(out.results[0]!.explanation?.stage_ranks.fts).toBe(1)
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb } from '@moabualruz/fulcrum-core'
import { runMigrations } from '@moabualruz/fulcrum-core'
import { backfillCodeFiles, computeFileId } from '../setup/backfill-code-files.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

describe('backfillCodeFiles — v2a PR 3 Task 16', () => {
  let db: Database.Database
  beforeEach(() => {
    db = freshDb()
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')`).run()
  })
  afterEach(() => closeDb())

  function seedChunk(opts: { chunk_id: string; file_path: string }) {
    db.prepare(`INSERT INTO code_chunks (chunk_id, workspace_id, project_id, file_path, language, chunk_strategy, source_type, content, indexed_at)
                VALUES (?, 'ws_1', 'proj_1', ?, 'typescript', 'syntax', 'code', 'x', '2026-04-17T00:00:00Z')`)
      .run(opts.chunk_id, opts.file_path)
  }

  it('computeFileId is deterministic and prefix-distinct', () => {
    const id1 = computeFileId('proj_a', 'src/a.ts')
    const id2 = computeFileId('proj_a', 'src/a.ts')
    const id3 = computeFileId('proj_b', 'src/a.ts')
    expect(id1).toBe(id2)
    expect(id1).not.toBe(id3)
    expect(id1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('backfills code_files rows + links chunks via file_id', () => {
    seedChunk({ chunk_id: 'c1', file_path: 'src/a.ts' })
    seedChunk({ chunk_id: 'c2', file_path: 'src/a.ts' })
    seedChunk({ chunk_id: 'c3', file_path: 'src/b.ts' })

    const result = backfillCodeFiles(db)
    expect(result.filesBackfilled).toBe(2) // src/a.ts + src/b.ts
    expect(result.chunksLinked).toBe(3)

    const files = db.prepare('SELECT file_id, rel_path, chunks_count FROM code_files ORDER BY rel_path').all() as Array<{ file_id: string; rel_path: string; chunks_count: number }>
    expect(files).toHaveLength(2)
    const aRow = files.find(f => f.rel_path === 'src/a.ts')!
    expect(aRow.chunks_count).toBe(2)

    const linked = db.prepare(`SELECT COUNT(*) AS n FROM code_chunks WHERE file_id IS NOT NULL`).get() as { n: number }
    expect(linked.n).toBe(3)
  })

  it('is idempotent — re-running does not duplicate or relink', () => {
    seedChunk({ chunk_id: 'c1', file_path: 'src/a.ts' })
    backfillCodeFiles(db)
    const first = backfillCodeFiles(db)
    expect(first.filesBackfilled).toBe(0)
    expect(first.chunksLinked).toBe(0)
  })

  it('matches computeFileId formula on the inserted file_id', () => {
    seedChunk({ chunk_id: 'c1', file_path: 'src/x.ts' })
    backfillCodeFiles(db)
    const row = db.prepare(`SELECT file_id FROM code_files WHERE rel_path = 'src/x.ts'`).get() as { file_id: string }
    expect(row.file_id).toBe(computeFileId('proj_1', 'src/x.ts'))
  })
})

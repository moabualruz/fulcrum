import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, _configureDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'

/**
 * v2a PR 1 Task 5 — code_files / code_symbols / file_id column on code_chunks.
 *
 * Plan §3.3c shape. Existing code_chunks already exists with a different shape
 * (file_path-based, not file_id-based) — v2a PR 1 ships file_id as a forward-
 * compat ADD COLUMN (nullable) so PR 4's PCI watcher can populate it as it
 * indexes; the legacy file_path column stays. code_chunks_fts already has the
 * shape the plan mandates.
 */

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  return db
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)
}

function indexExists(db: Database.Database, name: string): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(name)
}

describe('code_files table — v2a Task 5', () => {
  afterEach(() => closeDb())

  it('exists with the §3.3c columns', () => {
    const db = freshDb()
    expect(tableExists(db, 'code_files')).toBe(true)
    const cols = (db.prepare('PRAGMA table_info(code_files)').all() as { name: string; notnull: number }[])
    const colByName = new Map(cols.map(c => [c.name, c]))
    for (const col of ['file_id', 'workspace_id', 'project_id', 'rel_path', 'language', 'sha256', 'mtime_ns', 'size_bytes', 'chunks_count', 'indexed_at', 'status', 'failure_reason', 'last_error_at']) {
      expect(colByName.has(col), `code_files.${col} missing`).toBe(true)
    }
    // Required NOT NULL on the load-bearing fields.
    for (const col of ['file_id', 'workspace_id', 'project_id', 'rel_path', 'sha256', 'mtime_ns', 'size_bytes', 'indexed_at', 'status']) {
      expect(colByName.get(col)?.notnull, `code_files.${col} should be NOT NULL`).toBe(1)
    }
  })

  it('enforces UNIQUE (project_id, rel_path)', () => {
    const db = freshDb()
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO code_files (file_id, workspace_id, project_id, rel_path, language, sha256, mtime_ns, size_bytes, indexed_at) VALUES ('f1','ws_1','proj_1','src/a.ts','typescript','aaa',1,10,1)`).run()
    expect(() => db.prepare(`INSERT INTO code_files (file_id, workspace_id, project_id, rel_path, language, sha256, mtime_ns, size_bytes, indexed_at) VALUES ('f2','ws_1','proj_1','src/a.ts','typescript','bbb',2,11,2)`).run()).toThrow()
  })

  it('idx_code_files_lang and idx_code_files_ws are present', () => {
    const db = freshDb()
    expect(indexExists(db, 'idx_code_files_lang')).toBe(true)
    expect(indexExists(db, 'idx_code_files_ws')).toBe(true)
  })
})

describe('code_symbols table — v2a Task 5', () => {
  afterEach(() => closeDb())

  it('exists with composite PK (file_id, name, line)', () => {
    const db = freshDb()
    expect(tableExists(db, 'code_symbols')).toBe(true)
    const cols = (db.prepare('PRAGMA table_info(code_symbols)').all() as { name: string; pk: number }[])
    const colByName = new Map(cols.map(c => [c.name, c]))
    for (const col of ['file_id', 'name', 'kind', 'line']) {
      expect(colByName.has(col), `code_symbols.${col} missing`).toBe(true)
    }
    expect(colByName.get('file_id')?.pk).toBeGreaterThan(0)
    expect(colByName.get('name')?.pk).toBeGreaterThan(0)
    expect(colByName.get('line')?.pk).toBeGreaterThan(0)
  })

  it('idx_code_symbols_name is present', () => {
    const db = freshDb()
    expect(indexExists(db, 'idx_code_symbols_name')).toBe(true)
  })

  it('cascades on code_files delete', () => {
    const db = freshDb()
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO code_files (file_id, workspace_id, project_id, rel_path, language, sha256, mtime_ns, size_bytes, indexed_at) VALUES ('f1','ws_1','proj_1','src/a.ts','typescript','aaa',1,10,1)`).run()
    db.prepare(`INSERT INTO code_symbols (file_id, name, kind, line) VALUES ('f1','foo','function',5)`).run()
    db.prepare(`DELETE FROM code_files WHERE file_id='f1'`).run()
    const remaining = db.prepare(`SELECT COUNT(*) AS n FROM code_symbols WHERE file_id='f1'`).get() as { n: number }
    expect(remaining.n).toBe(0)
  })
})

describe('code_chunks gains file_id column for v2a forward-compat', () => {
  afterEach(() => closeDb())

  it('code_chunks has file_id column (nullable transition; PR 4 PCI populates)', () => {
    const db = freshDb()
    const cols = (db.prepare('PRAGMA table_info(code_chunks)').all() as { name: string; notnull: number }[])
    const fid = cols.find(c => c.name === 'file_id')
    expect(fid, 'code_chunks.file_id missing').toBeDefined()
    expect(fid!.notnull).toBe(0)
  })

  it('idx_code_chunks_file partial index on file_id', () => {
    const db = freshDb()
    expect(indexExists(db, 'idx_code_chunks_file')).toBe(true)
  })
})

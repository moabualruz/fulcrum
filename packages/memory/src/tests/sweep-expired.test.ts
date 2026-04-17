import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb, runMigrations } from 'fulcrum-core'
import { sweepExpiredMemories, startSweepTimer, opportunisticSweep } from '../sweep.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

function seed(db: Database.Database, memory_id: string, expires_at: number | null) {
  db.prepare(`INSERT INTO memories (memory_id, workspace_id, project_id, scope, kind, title, content, slug, vault_path, expires_at, created_at, updated_at, last_accessed_at)
              VALUES (?, 'ws_1', 'proj_1', 'session', 'fact', ?, 'x', ?, ?, ?, '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z')`)
    .run(memory_id, memory_id, memory_id, `legacy/${memory_id}.md`, expires_at)
}

describe('sweepExpiredMemories — v2a PR 9 Task 45', () => {
  let db: Database.Database

  beforeEach(() => {
    db = freshDb()
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')`).run()
  })
  afterEach(() => closeDb())

  it('deletes rows whose expires_at is in the past (ms epoch)', () => {
    const past = Date.now() - 1000
    const future = Date.now() + 1000 * 60 * 60 * 24
    seed(db, 'mem_old', past)
    seed(db, 'mem_new', future)
    seed(db, 'mem_no_expires', null)

    const result = sweepExpiredMemories(db)
    expect(result.rowsDeleted).toBe(1)
    const remaining = (db.prepare('SELECT memory_id FROM memories ORDER BY memory_id').all() as { memory_id: string }[]).map(r => r.memory_id)
    expect(remaining).toEqual(['mem_new', 'mem_no_expires'])
  })

  it('is idempotent — running twice does not over-delete', () => {
    seed(db, 'mem_old', Date.now() - 1000)
    sweepExpiredMemories(db)
    const second = sweepExpiredMemories(db)
    expect(second.rowsDeleted).toBe(0)
  })

  it('returns ISO 8601 ranAt timestamp', () => {
    const result = sweepExpiredMemories(db)
    expect(result.ranAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('opportunisticSweep is the same operation, exposed for start_agent_run', () => {
    seed(db, 'mem_x', Date.now() - 1000)
    const r = opportunisticSweep(db)
    expect(r.rowsDeleted).toBe(1)
  })

  it('startSweepTimer fires the initial sweep + returns a stop handle', () => {
    seed(db, 'mem_old', Date.now() - 1000)
    const handle = startSweepTimer(db, 60_000) // 1-min interval (timer not asserted)
    expect((db.prepare(`SELECT COUNT(*) AS n FROM memories WHERE memory_id='mem_old'`).get() as { n: number }).n).toBe(0)
    handle.stop()
  })
})

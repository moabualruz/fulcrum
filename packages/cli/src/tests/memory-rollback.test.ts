import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, setDb, closeDb, runMigrations } from 'fulcrum-core'
import { rollbackMemories } from '../commands/memory-rollback.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

function ensureWorkspace(db: ReturnType<typeof freshDb>, wsId: string) {
  db.prepare('INSERT OR IGNORE INTO workspaces (workspace_id, name) VALUES (?, ?)').run(wsId, wsId)
  db.prepare('INSERT OR IGNORE INTO projects (project_id, workspace_id, name) VALUES (?, ?, ?)').run(wsId, wsId, wsId)
}

function seed(db: ReturnType<typeof freshDb>, opts: { workspace_id?: string; created_at: string; memory_id: string }) {
  const wsId = opts.workspace_id ?? 'ws_test'
  ensureWorkspace(db, wsId)
  db.prepare(`
    INSERT INTO memories (memory_id, workspace_id, project_id, slug, vault_path, scope, kind, content, content_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'project', 'fact', 'test content', 'hash_' || ?, ?, ?)
  `).run(
    opts.memory_id,
    wsId,
    wsId,
    opts.memory_id,
    'legacy/' + opts.memory_id + '.md',
    opts.memory_id,
    opts.created_at,
    opts.created_at,
  )
}

describe('rollbackMemories', () => {
  let db: ReturnType<typeof freshDb>

  beforeEach(() => {
    db = freshDb()
    // Seed a pre-cutoff + post-cutoff row
    seed(db, { memory_id: 'mem_before', created_at: '2026-04-16T10:00:00Z' })
    seed(db, { memory_id: 'mem_after',  created_at: '2026-04-17T10:00:00Z' })
  })

  afterEach(() => closeDb())

  it('deletes rows created after --since in workspace scope', async () => {
    const r = await rollbackMemories({
      since: '2026-04-17T00:00:00Z',
      crossWorkspace: false,
      workspaceId: 'ws_test',
      db,
    })
    expect(r.deleted).toBe(1)
    expect(r.scanned).toBe(1)
    const rows = db.prepare('SELECT memory_id FROM memories ORDER BY memory_id').all() as Array<{ memory_id: string }>
    expect(rows.map(r => r.memory_id)).toEqual(['mem_before'])
  })

  it('leaves rows in other workspaces untouched when not cross-workspace', async () => {
    seed(db, { memory_id: 'mem_other', workspace_id: 'ws_other', created_at: '2026-04-17T12:00:00Z' })
    const r = await rollbackMemories({
      since: '2026-04-17T00:00:00Z',
      crossWorkspace: false,
      workspaceId: 'ws_test',
      db,
    })
    expect(r.deleted).toBe(1)
    const other = db.prepare("SELECT memory_id FROM memories WHERE workspace_id = 'ws_other'").all()
    expect(other).toHaveLength(1)
  })

  it('deletes across workspaces when cross-workspace is set', async () => {
    seed(db, { memory_id: 'mem_other', workspace_id: 'ws_other', created_at: '2026-04-17T12:00:00Z' })
    const r = await rollbackMemories({
      since: '2026-04-17T00:00:00Z',
      crossWorkspace: true,
      db,
    })
    expect(r.deleted).toBe(2)
  })

  it('records an audit event row', async () => {
    await rollbackMemories({
      since: '2026-04-17T00:00:00Z',
      crossWorkspace: false,
      workspaceId: 'ws_test',
      db,
    })
    const ev = db.prepare('SELECT COUNT(*) as n FROM memory_rollback_events').get() as { n: number }
    expect(ev.n).toBe(1)
  })

  it('rejects garbage --since input', async () => {
    await expect(rollbackMemories({
      since: 'not-a-timestamp',
      crossWorkspace: false,
      db,
    })).rejects.toThrow(/ISO-8601/)
  })
})

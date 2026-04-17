import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, setDb, closeDb } from 'fulcrum-agent-core'
import { runMigrations } from 'fulcrum-agent-core'
import { CURRENT_VERSION, scanStaleRows, runNormalizeVersion } from '../normalize-version.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

function seedMemory(db: ReturnType<typeof freshDb>, memId: string, normalizeVersion: number) {
  db.prepare(`INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-01-01T00:00:00Z')`).run()
  db.prepare(`INSERT OR IGNORE INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-01-01T00:00:00Z')`).run()
  db.prepare(`
    INSERT INTO memories (memory_id, workspace_id, project_id, content, kind, scope, normalize_version, created_at, updated_at)
    VALUES (?, 'ws_1', 'proj_1', 'test content for normalization', 'decision', 'project', ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
  `).run(memId, normalizeVersion)
}

describe('CURRENT_VERSION', () => {
  it('is a positive integer', () => {
    expect(typeof CURRENT_VERSION).toBe('number')
    expect(CURRENT_VERSION).toBeGreaterThan(0)
  })
})

describe('scanStaleRows', () => {
  afterEach(() => closeDb())

  it('returns rows where normalize_version < CURRENT_VERSION', () => {
    const db = freshDb()
    seedMemory(db, 'mem_stale_1', 0)
    seedMemory(db, 'mem_stale_2', 0)
    seedMemory(db, 'mem_current', CURRENT_VERSION)
    const stale = scanStaleRows(db)
    const ids = stale.map(r => r.memory_id)
    expect(ids).toContain('mem_stale_1')
    expect(ids).toContain('mem_stale_2')
    expect(ids).not.toContain('mem_current')
  })

  it('returns empty array when all rows are current', () => {
    const db = freshDb()
    seedMemory(db, 'mem_current', CURRENT_VERSION)
    expect(scanStaleRows(db)).toHaveLength(0)
  })
})

describe('runNormalizeVersion', () => {
  afterEach(() => closeDb())

  it('updates stale rows to CURRENT_VERSION', async () => {
    const db = freshDb()
    seedMemory(db, 'mem_stale', 0)
    const result = await runNormalizeVersion(db)
    expect(result.updated).toBe(1)
    const row = db.prepare('SELECT normalize_version FROM memories WHERE memory_id = ?').get('mem_stale') as { normalize_version: number }
    expect(row.normalize_version).toBe(CURRENT_VERSION)
  })

  it('returns updated=0 when no stale rows', async () => {
    const db = freshDb()
    seedMemory(db, 'mem_current', CURRENT_VERSION)
    const result = await runNormalizeVersion(db)
    expect(result.updated).toBe(0)
  })

  it('updates updated_at on reprocessed rows', async () => {
    const db = freshDb()
    seedMemory(db, 'mem_stale', 0)
    const before = db.prepare('SELECT updated_at FROM memories WHERE memory_id = ?').get('mem_stale') as { updated_at: string }
    await runNormalizeVersion(db)
    const after = db.prepare('SELECT updated_at FROM memories WHERE memory_id = ?').get('mem_stale') as { updated_at: string }
    expect(after.updated_at).not.toBe(before.updated_at)
  })

  it('is idempotent: running twice does not double-process', async () => {
    const db = freshDb()
    seedMemory(db, 'mem_stale', 0)
    await runNormalizeVersion(db)
    const second = await runNormalizeVersion(db)
    expect(second.updated).toBe(0)
  })
})

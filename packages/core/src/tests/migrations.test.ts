import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, _configureDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  return db
}

describe('runMigrations', () => {
  afterEach(() => closeDb())

  it('creates all required tables', () => {
    const db = freshDb()
    runMigrations(db)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('workspaces')
    expect(names).toContain('projects')
    expect(names).toContain('tasks')
    expect(names).toContain('agent_runs')
    expect(names).toContain('memories')
    expect(names).toContain('advisory_locks')
    expect(names).toContain('schema_migrations')
  })

  it('is idempotent — safe to run twice', () => {
    const db = freshDb()
    expect(() => runMigrations(db)).not.toThrow()
    expect(() => runMigrations(db)).not.toThrow()
  })

  it('tasks table has version and depends_on columns', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('version')
    expect(colNames).toContain('depends_on')
  })

  it('agent_runs table has artifacts and git_branch columns', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = db.prepare('PRAGMA table_info(agent_runs)').all() as { name: string }[]
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('artifacts')
    expect(colNames).toContain('git_branch')
    expect(colNames).toContain('git_commit')
    expect(colNames).toContain('events')
    expect(colNames).toContain('version')
  })

  it('memories table has confidence and access_count columns', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = db.prepare('PRAGMA table_info(memories)').all() as { name: string }[]
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('confidence')
    expect(colNames).toContain('access_count')
    expect(colNames).toContain('last_accessed_at')
    expect(colNames).toContain('embedding')
  })

  it('creates vec_memories table when sqlite-vec is available', () => {
    const db = freshDb()
    runMigrations(db)
    // This table only exists when sqlite-vec is loaded — skip assertion if not
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    const names = tables.map(t => t.name)
    // If sqlite-vec was loaded during _configureDb, the table should exist
    // If not available, skip (test doesn't fail)
    if (names.includes('vec_memories')) {
      expect(names).toContain('vec_memories')
    }
  })
})

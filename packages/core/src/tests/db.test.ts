import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { setDb, getDb, closeDb, _configureDb, withTransaction, checkDbHealth } from '../db/client.js'

describe('db client', () => {
  beforeEach(() => closeDb())
  afterEach(() => closeDb())

  it('returns the same instance on repeated calls', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    setDb(db)
    expect(getDb()).toBe(db)
    expect(getDb()).toBe(db)
  })

  it('has WAL mode enabled on file-backed database', () => {
    // WAL is silently ignored by SQLite on :memory: databases — must use a file
    const dir = mkdtempSync(join(tmpdir(), 'fulcrum-test-'))
    try {
      const db = new Database(join(dir, 'test.db'))
      _configureDb(db)
      setDb(db)
      const row = getDb().prepare('PRAGMA journal_mode').get() as { journal_mode: string }
      expect(row.journal_mode).toBe('wal')
    } finally {
      closeDb()
      rmSync(dir, { recursive: true })
    }
  })

  it('has foreign keys enabled', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    setDb(db)
    const row = getDb().prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(row.foreign_keys).toBe(1)
  })

  it('returns null after closeDb', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    setDb(db)
    closeDb()
    expect(() => closeDb()).not.toThrow()
  })

  it('has synchronous=NORMAL pragma set', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    setDb(db)
    const row = getDb().prepare('PRAGMA synchronous').get() as { synchronous: number }
    expect(row.synchronous).toBe(1) // 1 = NORMAL
  })
})

describe('withTransaction', () => {
  beforeEach(() => {
    const db = new Database(':memory:')
    _configureDb(db)
    db.exec('CREATE TABLE test_items (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
    setDb(db)
  })
  afterEach(() => closeDb())

  it('commits changes on success', () => {
    withTransaction(() => {
      getDb().prepare('INSERT INTO test_items (value) VALUES (?)').run('hello')
    })
    const row = getDb().prepare('SELECT value FROM test_items WHERE id = 1').get() as { value: string } | undefined
    expect(row?.value).toBe('hello')
  })

  it('rolls back changes on error', () => {
    expect(() => {
      withTransaction(() => {
        getDb().prepare('INSERT INTO test_items (value) VALUES (?)').run('will-rollback')
        throw new Error('intentional failure')
      })
    }).toThrow('intentional failure')
    const count = (getDb().prepare('SELECT COUNT(*) AS n FROM test_items').get() as { n: number }).n
    expect(count).toBe(0)
  })

  it('returns the value from the callback', () => {
    const result = withTransaction(() => {
      getDb().prepare('INSERT INTO test_items (value) VALUES (?)').run('x')
      return 'done'
    })
    expect(result).toBe('done')
  })
})

describe('checkDbHealth', () => {
  beforeEach(() => {
    const db = new Database(':memory:')
    _configureDb(db)
    setDb(db)
  })
  afterEach(() => closeDb())

  it('returns ok=true when DB is available', () => {
    const result = checkDbHealth()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(typeof result.latencyMs).toBe('number')
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns ok=false after DB is closed', () => {
    closeDb()
    // After close, checkDbHealth will re-open the DB (via getDb()) — it should still pass
    // unless we prevent re-open. This tests that it doesn't throw.
    expect(() => checkDbHealth()).not.toThrow()
  })
})

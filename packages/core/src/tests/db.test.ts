import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, getDb, closeDb, _configureDb } from '../db/client.js'

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

  it('has WAL mode enabled', () => {
    const db = new Database(':memory:')
    _configureDb(db)
    setDb(db)
    const row = getDb().prepare('PRAGMA journal_mode').get() as { journal_mode: string }
    expect(row.journal_mode).toBe('wal')
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
})

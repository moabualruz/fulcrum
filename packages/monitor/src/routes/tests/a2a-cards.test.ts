import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, setDb, closeDb, runMigrations } from 'fulcrum-core'
import { handleA2ACard, handleA2ACardList } from '../a2a-cards.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

describe('handleA2ACard', () => {
  afterEach(() => closeDb())

  it('returns A2A-spec card for software_engineer role', () => {
    const db = freshDb()
    const result = handleA2ACard('software_engineer', db)
    expect(result).not.toHaveProperty('status')
    expect(result).toHaveProperty('body')
    const body = (result as { body: Record<string, unknown> }).body
    // A2A spec required fields
    expect(body).toHaveProperty('name')
    expect(body).toHaveProperty('description')
    expect(body).toHaveProperty('version')
  })

  it('returns 404 for unknown role', () => {
    const db = freshDb()
    const result = handleA2ACard('nonexistent_role_xyz', db)
    expect(result).toHaveProperty('status', 404)
  })
})

describe('handleA2ACardList', () => {
  afterEach(() => closeDb())

  it('returns array of A2A cards', () => {
    const db = freshDb()
    const result = handleA2ACardList(db)
    expect(result).toHaveProperty('body')
    const body = (result as { body: unknown[] }).body
    expect(Array.isArray(body)).toBe(true)
  })
})

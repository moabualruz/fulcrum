import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, setDb, closeDb, runMigrations } from 'fulcrum-core'
import { getAgentCard, listAgentCards } from '../actions/get-agent-card.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

describe('getAgentCard', () => {
  afterEach(() => closeDb())

  it('returns A2A card for registered role', () => {
    const db = freshDb()
    const card = getAgentCard('software_engineer', db)
    expect(card).not.toBeNull()
    expect(card).toHaveProperty('name')
    expect(card).toHaveProperty('description')
    expect(card).toHaveProperty('version')
  })

  it('returns null for unknown role', () => {
    const db = freshDb()
    const card = getAgentCard('nonexistent_xyz', db)
    expect(card).toBeNull()
  })
})

describe('listAgentCards', () => {
  afterEach(() => closeDb())

  it('returns cards for all seeded canonical definitions', () => {
    const db = freshDb()
    const cards = listAgentCards(db)
    expect(Array.isArray(cards)).toBe(true)
    // schema.ts seeds 24 canonical roles on runMigrations
    expect(cards.length).toBe(24)
  })

  it('returns card for each registered definition', () => {
    const db = freshDb()
    const cards = listAgentCards(db)
    expect(cards.length).toBeGreaterThanOrEqual(1)
    expect(cards[0]).toHaveProperty('name')
  })
})

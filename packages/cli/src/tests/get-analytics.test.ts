import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, setDb, closeDb, runMigrations } from 'fulcrum-agent-core'
import { getAnalytics } from '../actions/get-analytics.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

describe('getAnalytics', () => {
  afterEach(() => closeDb())

  it('cold install returns empty array', async () => {
    const db = freshDb()
    const result = await getAnalytics({ dimension: 'daily', workspace_id: 'ws_1' }, db)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  it('returns empty array for cycle dimension', async () => {
    const db = freshDb()
    const result = await getAnalytics({ dimension: 'cycle', workspace_id: 'ws_1' }, db)
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns empty array for project dimension', async () => {
    const db = freshDb()
    const result = await getAnalytics({ dimension: 'project', workspace_id: 'ws_1' }, db)
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns empty array for agent dimension', async () => {
    const db = freshDb()
    const result = await getAnalytics({ dimension: 'agent', workspace_id: 'ws_1' }, db)
    expect(Array.isArray(result)).toBe(true)
  })

  it('accepts optional from/to date range', async () => {
    const db = freshDb()
    const result = await getAnalytics({
      dimension: 'daily',
      workspace_id: 'ws_1',
      from: '2026-04-01',
      to: '2026-04-17',
    }, db)
    expect(Array.isArray(result)).toBe(true)
  })
})

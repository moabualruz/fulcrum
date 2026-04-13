import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

export function resetTestDb(): void {
  closeDb()
}

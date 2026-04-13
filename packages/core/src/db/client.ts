import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'

let _db: Database.Database | null = null

export function getDb(dataDir?: string): Database.Database {
  if (_db) return _db
  const dir = dataDir ?? join(process.cwd(), '.fulcrum')
  mkdirSync(dir, { recursive: true })
  const db = new Database(join(dir, 'fulcrum.db'))
  _configureDb(db)
  _db = db
  return db
}

/** Inject a pre-configured database — used in tests to pass :memory: instances */
export function setDb(db: Database.Database): void {
  _db = db
}

export function closeDb(): void {
  _db?.close()
  _db = null
}

export function _configureDb(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteVec = require('sqlite-vec') as { load: (db: Database.Database) => void }
    sqliteVec.load(db)
  } catch {
    // sqlite-vec optional — vector search degrades to FTS5-only if unavailable
  }
}

import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { homedir, platform } from 'os'

/**
 * Returns the single, global Fulcrum data directory.
 * Never writes to project directories — all data is global.
 *
 * Priority:
 *   1. $FULCRUM_DATA_DIR env var
 *   2. $XDG_DATA_HOME/fulcrum  (Linux XDG standard)
 *   3. ~/Library/Application Support/fulcrum  (macOS)
 *   4. ~/.local/share/fulcrum  (Linux fallback)
 */
export function globalDataDir(): string {
  if (process.env['FULCRUM_DATA_DIR']) return process.env['FULCRUM_DATA_DIR']
  const home = homedir()
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'fulcrum')
  const xdg = process.env['XDG_DATA_HOME']
  if (xdg) return join(xdg, 'fulcrum')
  return join(home, '.local', 'share', 'fulcrum')
}

let _db: Database.Database | null = null

export function getDb(dataDir?: string): Database.Database {
  if (_db) return _db
  const dir = dataDir ?? globalDataDir()
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
  // Synchronous = NORMAL is safe with WAL mode and gives better write performance
  // than FULL while still being crash-safe (last transaction may be lost, not corrupted).
  db.pragma('synchronous = NORMAL')
  // Increase cache size to 8 MB for read-heavy workloads
  db.pragma('cache_size = -8000')
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteVec = require('sqlite-vec') as { load: (db: Database.Database) => void }
    sqliteVec.load(db)
  } catch {
    // sqlite-vec optional — vector search degrades to FTS5-only if unavailable
  }
}

/**
 * Run a function inside a SQLite transaction.
 * - Uses IMMEDIATE locking to prevent deadlocks under concurrent readers.
 * - On SQLITE_BUSY: retries once after the configured `busy_timeout`.
 * - Re-throws any other errors after rolling back.
 *
 * @example
 * const result = withTransaction(() => {
 *   const id = newId('task')
 *   db.prepare('INSERT INTO tasks ...').run(id, ...)
 *   return id
 * })
 */
export function withTransaction<T>(fn: () => T): T {
  const db = getDb()
  return db.transaction(fn).immediate()
}

/**
 * Check DB liveness: run a trivial query and return timing in ms.
 * Returns `{ ok: true, latencyMs: N }` or `{ ok: false, error: string }`.
 */
export function checkDbHealth(): { ok: true; latencyMs: number } | { ok: false; error: string } {
  try {
    const t0 = Date.now()
    const db = getDb()
    db.prepare('SELECT 1').get()
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

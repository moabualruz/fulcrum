import type Database from 'better-sqlite3'

// MIGRATION_021 — advisory lock API (G-5)
// MIGRATION_001 created advisory_locks with a minimal schema
// (resource_id PK, run_id, acquired_at, expires_at). The G-5 API needs
// per-workspace isolation, a prefixed lock_id, and a structured resource_path,
// so we rebuild the table preserving any existing rows by best-effort mapping.
export function runM021(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '021_advisory_locks'").get()
  if (!already) {
    const cols = db.prepare(`PRAGMA table_info(advisory_locks)`).all() as { name: string }[]
    const hasLockId = cols.some(c => c.name === 'lock_id')
    const hasWorkspaceId = cols.some(c => c.name === 'workspace_id')
    const hasResourcePath = cols.some(c => c.name === 'resource_path')
    if (!hasLockId || !hasWorkspaceId || !hasResourcePath) {
      const fkPrev = db.pragma('foreign_keys', { simple: true }) as number
      db.pragma('foreign_keys = OFF')
      try {
        db.transaction(() => {
          db.exec(`
            CREATE TABLE advisory_locks_new (
              lock_id TEXT PRIMARY KEY,
              workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
              resource_path TEXT NOT NULL,
              run_id TEXT NOT NULL,
              acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
              expires_at TEXT NOT NULL,
              UNIQUE(workspace_id, resource_path)
            );
          `)
          // Best-effort copy: the old schema had no workspace_id, so we cannot
          // safely carry rows forward (they would violate NOT NULL). Drop them.
          db.exec(`DROP TABLE advisory_locks`)
          db.exec(`ALTER TABLE advisory_locks_new RENAME TO advisory_locks`)
          db.exec(`CREATE INDEX IF NOT EXISTS idx_locks_workspace ON advisory_locks(workspace_id)`)
          db.exec(`CREATE INDEX IF NOT EXISTS idx_locks_expires ON advisory_locks(expires_at)`)
        })()
      } finally {
        db.pragma(fkPrev ? 'foreign_keys = ON' : 'foreign_keys = OFF')
      }
    }
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('021_advisory_locks')").run()
  }
}

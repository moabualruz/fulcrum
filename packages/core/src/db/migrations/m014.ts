import type Database from 'better-sqlite3'

// MIGRATION_014 — adds direction and conflict_state columns to sync_states for databases
// created before MIGRATION_010_SYNC included these columns.
// Each ALTER is wrapped in try/catch to guard against duplicate column errors on fresh
// databases where MIGRATION_010_SYNC already created both columns.
const MIGRATION_014_SYNC_DIRECTION = [
  `ALTER TABLE sync_states ADD COLUMN direction TEXT NOT NULL DEFAULT 'bidirectional'`,
  `ALTER TABLE sync_states ADD COLUMN conflict_state TEXT NOT NULL DEFAULT 'none'`,
]

export function runM014(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '014_sync_direction'").get()
  if (!already) {
    for (const stmt of MIGRATION_014_SYNC_DIRECTION) {
      try {
        db.exec(stmt)
      } catch (err: unknown) {
        // Duplicate column means MIGRATION_010 already created it — safe to ignore
        const msg = (err as { message?: string }).message ?? ''
        if (!msg.includes('duplicate column name') && !msg.includes('already exists')) {
          throw err
        }
      }
    }
    db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('014_sync_direction')`).run()
  }
}

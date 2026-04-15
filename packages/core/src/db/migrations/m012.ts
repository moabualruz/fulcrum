import type Database from 'better-sqlite3'

const MIGRATION_012_MEMORY_FRESHNESS = `ALTER TABLE memories ADD COLUMN freshness REAL NOT NULL DEFAULT 1.0;`

export function runM012(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '012_memory_freshness'").get()
  if (!already) {
    try {
      db.exec(MIGRATION_012_MEMORY_FRESHNESS)
    } catch (err: unknown) {
      if (!(err instanceof Error && err.message.includes('duplicate column name'))) throw err
    }
    db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('012_memory_freshness')`).run()
  }
}

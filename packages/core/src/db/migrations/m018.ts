import type Database from 'better-sqlite3'

export function runM018(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '018_memory_importance'").get()
  if (!already) {
    try {
      db.prepare('ALTER TABLE memories ADD COLUMN importance REAL NOT NULL DEFAULT 0.5').run()
    } catch (e: unknown) {
      if (!(e instanceof Error && (e.message.includes('duplicate column name') || e.message.includes('already exists')))) throw e
    }
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('018_memory_importance')").run()
  }
}

import type Database from 'better-sqlite3'

// MIGRATION_038 — timestamp format standard documentation (Task 3.4)
// This is a metadata-only migration (no schema change).
// -- Future DEFAULT expressions should use strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
// -- NOT datetime('now'). Existing application code uses new Date().toISOString()
// -- (T format). New columns should match that format for consistency.
export function runM038(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '038_timestamp_standard'").get()
  if (!already) {
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('038_timestamp_standard')").run()
  }
}

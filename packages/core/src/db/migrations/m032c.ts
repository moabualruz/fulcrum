import type Database from 'better-sqlite3'

// MIGRATION_032c — add heartbeat_at column to team_instances
export function runM032c(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '032c_team_instances_heartbeat'").get()
  if (!already) {
    try {
      db.exec(`ALTER TABLE team_instances ADD COLUMN heartbeat_at TEXT`)
    } catch { /* column may already exist */ }
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('032c_team_instances_heartbeat')").run()
  }
}

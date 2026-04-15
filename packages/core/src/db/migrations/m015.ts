import type Database from 'better-sqlite3'

// MIGRATION_015 — adds pi_profile column to agent_runs for databases created before
// pi_profile was included in the CREATE TABLE statement.
// Wrapped in try/catch to guard against duplicate column errors on fresh databases.
const MIGRATION_015_PI_PROFILE = `ALTER TABLE agent_runs ADD COLUMN pi_profile TEXT`

export function runM015(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '015_pi_profile'").get()
  if (!already) {
    try {
      db.exec(MIGRATION_015_PI_PROFILE)
    } catch (err: unknown) {
      // Duplicate column means CREATE TABLE already included pi_profile — safe to ignore
      const msg = (err as { message?: string }).message ?? ''
      if (!msg.includes('duplicate column name') && !msg.includes('already exists')) {
        throw err
      }
    }
    db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('015_pi_profile')`).run()
  }
}

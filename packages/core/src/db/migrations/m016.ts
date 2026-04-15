import type Database from 'better-sqlite3'

// MIGRATION_016 — adds config_path to workspaces table.
// Wrapped in try/catch to guard against duplicate column errors on fresh databases.
const MIGRATION_016_WORKSPACE_CONFIG = `ALTER TABLE workspaces ADD COLUMN config_path TEXT`

export function runM016(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '016_workspace_config'").get()
  if (!already) {
    try {
      db.exec(MIGRATION_016_WORKSPACE_CONFIG)
    } catch (err: unknown) {
      // Duplicate column means workspaces already has config_path — safe to ignore
      const msg = (err as { message?: string }).message ?? ''
      if (!msg.includes('duplicate column name') && !msg.includes('already exists')) {
        throw err
      }
    }
    db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('016_workspace_config')`).run()
  }
}

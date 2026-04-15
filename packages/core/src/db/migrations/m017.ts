import type Database from 'better-sqlite3'

export function runM017(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '017_task_assigned_run'").get()
  if (!already) {
    try {
      db.exec('ALTER TABLE tasks ADD COLUMN assigned_run_id TEXT REFERENCES agent_runs(run_id) ON DELETE SET NULL')
    } catch (err: unknown) {
      // Duplicate column means tasks already has assigned_run_id — safe to ignore
      const msg = (err as { message?: string }).message ?? ''
      if (!msg.includes('duplicate column name') && !msg.includes('already exists')) {
        throw err
      }
    }
    db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('017_task_assigned_run')`).run()
  }
}

import type Database from 'better-sqlite3'

export function runM019(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '019_agent_state_projection'").get()
  if (!already) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_state_projection (
        run_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        project_id TEXT,
        agent_id TEXT,
        agent_role TEXT,
        pi_profile TEXT,
        status TEXT NOT NULL,
        task_id TEXT,
        current_step TEXT,
        current_path TEXT,
        progress_pct REAL,
        heartbeat_at TEXT,
        blocker TEXT,
        worktree_id TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_asp_workspace ON agent_state_projection(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_asp_status ON agent_state_projection(status);
    `)
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('019_agent_state_projection')").run()
  }
}

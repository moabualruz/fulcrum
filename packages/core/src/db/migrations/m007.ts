import type Database from 'better-sqlite3'

const MIGRATION_007_WORKFLOWS = `
CREATE TABLE IF NOT EXISTS workflow_runs (
  wf_id            TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id       TEXT REFERENCES projects(project_id),
  display_id       TEXT NOT NULL,
  workflow_name    TEXT NOT NULL,
  workflow_version TEXT NOT NULL DEFAULT '1.0',
  status           TEXT NOT NULL DEFAULT 'created'
    CHECK(status IN ('created','ready','running','waiting_input','waiting_dependency',
                     'blocked','failed','completed','cancelled')),
  status_category  TEXT NOT NULL DEFAULT 'active'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  task_id          TEXT REFERENCES tasks(task_id),
  issue_id         TEXT REFERENCES issues(issue_id),
  steps            TEXT NOT NULL DEFAULT '[]',
  current_step_id  TEXT,
  handoff_refs     TEXT NOT NULL DEFAULT '[]',
  artifact_refs    TEXT NOT NULL DEFAULT '[]',
  error            TEXT,
  version          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  started_at       TEXT,
  completed_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_wf_runs_workspace ON workflow_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wf_runs_status    ON workflow_runs(status_category);
`

export function runM007(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '007_workflows'").get()
  if (!already) {
    db.exec(MIGRATION_007_WORKFLOWS)
    db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('007_workflows')`).run()
  }
}

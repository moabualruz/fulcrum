import type Database from 'better-sqlite3'

const MIGRATION_013_HANDOFF_STATUS = `
CREATE TABLE IF NOT EXISTS handoffs_new (
  handoff_id           TEXT PRIMARY KEY,
  workspace_id         TEXT NOT NULL,
  project_id           TEXT,
  from_agent_id        TEXT,
  to_agent_id          TEXT,
  task_id              TEXT REFERENCES tasks(task_id),
  issue_id             TEXT REFERENCES issues(issue_id),
  goal                 TEXT NOT NULL,
  task_type            TEXT,
  priority             TEXT NOT NULL DEFAULT 'normal',
  scope                TEXT NOT NULL DEFAULT 'task',
  inputs               TEXT NOT NULL DEFAULT '{}',
  constraints          TEXT,
  done_criteria        TEXT,
  artifact_contract_id TEXT REFERENCES artifact_contracts(contract_id),
  handoff_mode         TEXT NOT NULL DEFAULT 'brief',
  status               TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','claimed','completed','cancelled')),
  claimed_at           TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO handoffs_new (
  handoff_id, workspace_id, project_id, from_agent_id, to_agent_id,
  task_id, issue_id, goal, task_type, priority, scope,
  inputs, constraints, done_criteria, artifact_contract_id,
  handoff_mode, status, created_at
)
SELECT
  handoff_id, workspace_id, project_id, from_agent_id, to_agent_id,
  task_id, issue_id, goal, task_type, priority, scope,
  inputs, constraints, done_criteria, artifact_contract_id,
  handoff_mode, 'pending', created_at
FROM handoffs;
DROP TABLE handoffs;
ALTER TABLE handoffs_new RENAME TO handoffs;
`

export function runM013(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '013_handoff_status'").get()
  if (!already) {
    db.transaction(() => {
      db.exec(MIGRATION_013_HANDOFF_STATUS)
    })()
    db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('013_handoff_status')`).run()
  }
}

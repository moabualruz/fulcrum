// packages/teams/src/schema.ts
import type Database from 'better-sqlite3'

const MIGRATION_006_TEAMS = `
CREATE TABLE IF NOT EXISTS team_templates (
  template_id TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  slots       TEXT NOT NULL DEFAULT '[]',
  policy      TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_instances (
  instance_id          TEXT PRIMARY KEY,
  template_id          TEXT NOT NULL REFERENCES team_templates(template_id),
  workspace_id         TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id           TEXT REFERENCES projects(project_id),
  display_id           TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'created'
    CHECK(status IN ('created','ready','spawning','running','waiting',
                     'blocked','completed','failed','cancelled')),
  status_category      TEXT NOT NULL DEFAULT 'active'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  purpose              TEXT NOT NULL,
  task_id              TEXT REFERENCES tasks(task_id),
  created_by_agent_id  TEXT NOT NULL,
  resolved_slots       TEXT NOT NULL DEFAULT '{}',
  version              INTEGER NOT NULL DEFAULT 0,
  heartbeat_at         TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_team_instances_workspace ON team_instances(workspace_id);
CREATE INDEX IF NOT EXISTS idx_team_instances_status    ON team_instances(status_category);

CREATE TABLE IF NOT EXISTS team_members (
  instance_id TEXT NOT NULL REFERENCES team_instances(instance_id) ON DELETE CASCADE,
  slot_id     TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  role        TEXT NOT NULL,
  joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (instance_id, slot_id, agent_id)
);
`

export function runMigration006Teams(db: Database.Database): void {
  db.exec(MIGRATION_006_TEAMS)
  db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('006_teams')`).run()
}

/**
 * TEAM-001: Add heartbeat_at column to team_instances if absent.
 * Safe to call on both fresh and upgraded databases — the column is optional.
 */
export function runMigration006TeamsHeartbeat(db: Database.Database): void {
  const already = db.prepare(
    `SELECT 1 FROM schema_migrations WHERE name = '006_teams_heartbeat_at'`
  ).get()
  if (already) return

  // Only ADD if the column doesn't already exist (e.g. a fresh DB got it from DDL)
  const cols = db.prepare(`PRAGMA table_info(team_instances)`).all() as { name: string }[]
  const hasCol = cols.some(c => c.name === 'heartbeat_at')
  if (!hasCol) {
    db.exec(`ALTER TABLE team_instances ADD COLUMN heartbeat_at TEXT`)
  }

  db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('006_teams_heartbeat_at')`).run()
}

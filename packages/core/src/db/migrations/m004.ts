import type Database from 'better-sqlite3'

const MIGRATION_004 = `
CREATE TABLE IF NOT EXISTS policy_rules (
  rule_id     TEXT PRIMARY KEY,
  scope       TEXT NOT NULL
    CHECK(scope IN ('system','user','workspace','project','team_agent','workflow_step')),
  scope_id    TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  action      TEXT NOT NULL CHECK(action IN ('allow','deny','audit_only')),
  matchers    TEXT NOT NULL DEFAULT '[]',
  enabled     INTEGER NOT NULL DEFAULT 1,
  priority    INTEGER NOT NULL DEFAULT 100,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_policy_rules_scope    ON policy_rules(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_policy_rules_priority ON policy_rules(priority DESC);
CREATE INDEX IF NOT EXISTS idx_policy_rules_enabled  ON policy_rules(enabled);

CREATE TABLE IF NOT EXISTS policy_events (
  evt_id        TEXT PRIMARY KEY,
  rule_id       TEXT,  -- no FK: rule_id may be a synthetic SYSTEM:* invariant ID
  workspace_id  TEXT NOT NULL,
  action        TEXT NOT NULL,
  matched       INTEGER NOT NULL DEFAULT 0,
  actor_id      TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  payload       TEXT NOT NULL DEFAULT '{}',
  ts            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_policy_events_workspace ON policy_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_policy_events_ts        ON policy_events(ts);
`

export function runM004(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '004_policy'").get()
  if (!already) {
    db.exec(MIGRATION_004)
    db.prepare(`INSERT INTO schema_migrations(name) VALUES ('004_policy')`).run()
  }
}

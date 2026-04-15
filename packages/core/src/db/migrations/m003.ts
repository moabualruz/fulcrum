import type Database from 'better-sqlite3'

const MIGRATION_003 = `
CREATE TABLE IF NOT EXISTS epics (
  epic_id         TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  display_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'backlog'
    CHECK(status IN ('backlog','in_progress','done','cancelled')),
  status_category TEXT NOT NULL DEFAULT 'backlog'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  priority        TEXT NOT NULL DEFAULT 'medium'
    CHECK(priority IN ('critical','high','medium','low','none')),
  milestone_id    TEXT,
  version         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS issues (
  issue_id         TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id       TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  epic_id          TEXT REFERENCES epics(epic_id),
  parent_issue_id  TEXT REFERENCES issues(issue_id),
  display_id       TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'backlog'
    CHECK(status IN ('backlog','ready','in_progress','blocked','in_review','done','cancelled')),
  status_category  TEXT NOT NULL DEFAULT 'backlog'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  priority         TEXT NOT NULL DEFAULT 'medium'
    CHECK(priority IN ('critical','high','medium','low','none')),
  assignee_agent_id TEXT,
  estimate_type    TEXT CHECK(estimate_type IN ('story_points','hours')),
  estimate_value   REAL,
  version          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS issue_labels (
  issue_id   TEXT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  added_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (issue_id, label)
);
CREATE INDEX IF NOT EXISTS idx_issue_labels_label ON issue_labels(label);

CREATE TABLE IF NOT EXISTS prds (
  prd_id          TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  display_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','review','approved','archived')),
  status_category TEXT NOT NULL DEFAULT 'active'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  file_path       TEXT,
  linked_epic_id  TEXT REFERENCES epics(epic_id),
  version         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
  plan_id         TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  display_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','active','completed','archived')),
  status_category TEXT NOT NULL DEFAULT 'active'
    CHECK(status_category IN ('backlog','active','blocked','done')),
  prd_id          TEXT REFERENCES prds(prd_id),
  file_path       TEXT,
  version         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plan_issues (
  plan_id    TEXT NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
  issue_id   TEXT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
  added_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (plan_id, issue_id)
);

CREATE TABLE IF NOT EXISTS prd_plans (
  prd_id   TEXT NOT NULL REFERENCES prds(prd_id) ON DELETE CASCADE,
  plan_id  TEXT NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (prd_id, plan_id)
);

-- FTS5 for planning entities
CREATE VIRTUAL TABLE IF NOT EXISTS epics_fts
  USING fts5(title, description, content='epics', content_rowid='rowid',
             tokenize='porter unicode61');
CREATE VIRTUAL TABLE IF NOT EXISTS issues_fts
  USING fts5(title, description, content='issues', content_rowid='rowid',
             tokenize='porter unicode61');
CREATE VIRTUAL TABLE IF NOT EXISTS prds_fts
  USING fts5(title, description, content='prds', content_rowid='rowid',
             tokenize='porter unicode61');
CREATE VIRTUAL TABLE IF NOT EXISTS plans_fts
  USING fts5(title, description, content='plans', content_rowid='rowid',
             tokenize='porter unicode61');

-- FTS5 triggers: epics
CREATE TRIGGER IF NOT EXISTS epics_fts_insert AFTER INSERT ON epics BEGIN
  INSERT INTO epics_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;
CREATE TRIGGER IF NOT EXISTS epics_fts_delete BEFORE DELETE ON epics BEGIN
  INSERT INTO epics_fts(epics_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
END;
CREATE TRIGGER IF NOT EXISTS epics_fts_update AFTER UPDATE ON epics BEGIN
  INSERT INTO epics_fts(epics_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
  INSERT INTO epics_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;

-- FTS5 triggers: issues
CREATE TRIGGER IF NOT EXISTS issues_fts_insert AFTER INSERT ON issues BEGIN
  INSERT INTO issues_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;
CREATE TRIGGER IF NOT EXISTS issues_fts_delete BEFORE DELETE ON issues BEGIN
  INSERT INTO issues_fts(issues_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
END;
CREATE TRIGGER IF NOT EXISTS issues_fts_update AFTER UPDATE ON issues BEGIN
  INSERT INTO issues_fts(issues_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
  INSERT INTO issues_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;

-- FTS5 triggers: prds
CREATE TRIGGER IF NOT EXISTS prds_fts_insert AFTER INSERT ON prds BEGIN
  INSERT INTO prds_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;
CREATE TRIGGER IF NOT EXISTS prds_fts_delete BEFORE DELETE ON prds BEGIN
  INSERT INTO prds_fts(prds_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
END;
CREATE TRIGGER IF NOT EXISTS prds_fts_update AFTER UPDATE ON prds BEGIN
  INSERT INTO prds_fts(prds_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
  INSERT INTO prds_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;

-- FTS5 triggers: plans
CREATE TRIGGER IF NOT EXISTS plans_fts_insert AFTER INSERT ON plans BEGIN
  INSERT INTO plans_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;
CREATE TRIGGER IF NOT EXISTS plans_fts_delete BEFORE DELETE ON plans BEGIN
  INSERT INTO plans_fts(plans_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
END;
CREATE TRIGGER IF NOT EXISTS plans_fts_update AFTER UPDATE ON plans BEGIN
  INSERT INTO plans_fts(plans_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
  INSERT INTO plans_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_epics_workspace   ON epics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_epics_project     ON epics(project_id);
CREATE INDEX IF NOT EXISTS idx_epics_status      ON epics(status_category);
CREATE INDEX IF NOT EXISTS idx_issues_workspace  ON issues(workspace_id);
CREATE INDEX IF NOT EXISTS idx_issues_project    ON issues(project_id);
CREATE INDEX IF NOT EXISTS idx_issues_epic       ON issues(epic_id);
CREATE INDEX IF NOT EXISTS idx_issues_status     ON issues(status_category);
CREATE INDEX IF NOT EXISTS idx_issues_parent     ON issues(parent_issue_id);
`

export function runM003(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '003_planning'").get()
  if (!already) {
    db.exec(MIGRATION_003)
    db.prepare(`INSERT INTO schema_migrations(name) VALUES ('003_planning')`).run()
  }
}

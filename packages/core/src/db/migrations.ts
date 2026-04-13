import type Database from 'better-sqlite3'

const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','in_progress','completed','blocked')),
  depends_on TEXT NOT NULL DEFAULT '[]',
  assigned_to TEXT,
  note TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_runs (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  role TEXT NOT NULL
    CHECK(role IN ('chief_of_staff','implementer','tester','reviewer','researcher','planner')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','blocked','stale','escalated')),
  current_step TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  output_summary TEXT,
  artifacts TEXT,
  git_branch TEXT,
  git_commit TEXT,
  events TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS memories (
  memory_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 1.0,
  embedding BLOB,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
  access_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS advisory_locks (
  resource_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts
  USING fts5(title, description, content='tasks', content_rowid='rowid');

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
  USING fts5(content, content='memories', content_rowid='rowid');

CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
END;
CREATE TRIGGER IF NOT EXISTS tasks_fts_delete BEFORE DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
END;
CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
  INSERT INTO tasks_fts(rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
END;

CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS memories_fts_delete BEFORE DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
END;
CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
  INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_runs_workspace ON agent_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_runs_task ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_updated ON agent_runs(updated_at);
CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
`

const MIGRATION_002 = `
-- workspaces
ALTER TABLE workspaces ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- projects
ALTER TABLE projects ADD COLUMN project_type TEXT;
ALTER TABLE projects ADD COLUMN root_path TEXT;
ALTER TABLE projects ADD COLUMN default_branch TEXT;
ALTER TABLE projects ADD COLUMN parent_project_id TEXT REFERENCES projects(project_id);
ALTER TABLE projects ADD COLUMN write_mode TEXT NOT NULL DEFAULT 'sequential';
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- tasks: full table recreation to remove restrictive CHECK constraint on status
CREATE TABLE tasks_new (
  task_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  display_id TEXT NOT NULL DEFAULT '',
  issue_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  status_category TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT NOT NULL DEFAULT 'medium',
  estimate_type TEXT,
  estimate_value REAL,
  depends_on TEXT NOT NULL DEFAULT '[]',
  assigned_to TEXT,
  note TEXT,
  done_criteria TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT,
  completed_at TEXT
);
INSERT INTO tasks_new SELECT task_id, workspace_id, project_id, '', NULL, title, description, status, 'backlog', 'medium', NULL, NULL, depends_on, assigned_to, note, NULL, version, created_at, updated_at, NULL, NULL FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
DROP TRIGGER IF EXISTS tasks_fts_insert;
DROP TRIGGER IF EXISTS tasks_fts_delete;
DROP TRIGGER IF EXISTS tasks_fts_update;
CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;
CREATE TRIGGER IF NOT EXISTS tasks_fts_delete BEFORE DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
END;
CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
  INSERT INTO tasks_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;

-- agent_runs: full table recreation to remove restrictive role CHECK constraint
CREATE TABLE agent_runs_new (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id TEXT,
  display_id TEXT NOT NULL DEFAULT '',
  agent_id TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  pi_profile TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  status_category TEXT NOT NULL DEFAULT 'active',
  current_step TEXT,
  current_path TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  output_summary TEXT,
  artifacts TEXT,
  git_branch TEXT,
  git_commit TEXT,
  heartbeat_at TEXT,
  blocker TEXT,
  worktree_id TEXT,
  events TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  finished_at TEXT
);
INSERT INTO agent_runs_new SELECT run_id, task_id, workspace_id, NULL, '', '', role, NULL, status, 'active', current_step, NULL, progress_pct, output_summary, artifacts, git_branch, git_commit, NULL, NULL, NULL, events, version, started_at, updated_at, completed_at, NULL FROM agent_runs;
DROP TABLE agent_runs;
ALTER TABLE agent_runs_new RENAME TO agent_runs;
CREATE INDEX IF NOT EXISTS idx_runs_workspace ON agent_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_runs_task ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_updated ON agent_runs(updated_at);

-- memories: add new columns
ALTER TABLE memories ADD COLUMN scope TEXT NOT NULL DEFAULT 'project';
ALTER TABLE memories ADD COLUMN kind TEXT NOT NULL DEFAULT 'fact';
ALTER TABLE memories ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE memories ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE memories ADD COLUMN canonical_text TEXT;
ALTER TABLE memories ADD COLUMN entities TEXT NOT NULL DEFAULT '[]';
ALTER TABLE memories ADD COLUMN event_time TEXT;
ALTER TABLE memories ADD COLUMN content_hash TEXT;
ALTER TABLE memories ADD COLUMN symbol_path TEXT;
ALTER TABLE memories ADD COLUMN task_id TEXT;
ALTER TABLE memories ADD COLUMN issue_id TEXT;
ALTER TABLE memories ADD COLUMN artifact_id TEXT;
ALTER TABLE memories ADD COLUMN provenance_refs TEXT NOT NULL DEFAULT '[]';

-- display_id_sequences
CREATE TABLE IF NOT EXISTS display_id_sequences (
  entity_type TEXT NOT NULL,
  project_id TEXT NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entity_type, project_id)
);

-- events
CREATE TABLE IF NOT EXISTS events (
  evt_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  evt_type TEXT NOT NULL,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  object_type TEXT,
  object_id TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'info',
  trace_id TEXT,
  span_id TEXT,
  correlation_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_workspace ON events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(evt_type);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_object ON events(object_type, object_id);

-- task_relations
CREATE TABLE IF NOT EXISTS task_relations (
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  target_task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, target_task_id, relation_type)
);
CREATE INDEX IF NOT EXISTS idx_task_relations_target ON task_relations(target_task_id);

-- task_labels
CREATE TABLE IF NOT EXISTS task_labels (
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  PRIMARY KEY (task_id, label)
);
CREATE INDEX IF NOT EXISTS idx_task_labels_label ON task_labels(label);

-- Recreate memories_fts to include title and summary
DROP TRIGGER IF EXISTS memories_fts_insert;
DROP TRIGGER IF EXISTS memories_fts_delete;
DROP TRIGGER IF EXISTS memories_fts_update;
DROP TABLE IF EXISTS memories_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
  USING fts5(content, title, summary, canonical_text, content='memories', content_rowid='rowid');

CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, title, summary, canonical_text)
    VALUES (new.rowid, new.content, new.title, new.summary, new.canonical_text);
END;
CREATE TRIGGER IF NOT EXISTS memories_fts_delete BEFORE DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, title, summary, canonical_text)
    VALUES ('delete', old.rowid, old.content, old.title, old.summary, old.canonical_text);
END;
CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, title, summary, canonical_text)
    VALUES ('delete', old.rowid, old.content, old.title, old.summary, old.canonical_text);
  INSERT INTO memories_fts(rowid, content, title, summary, canonical_text)
    VALUES (new.rowid, new.content, new.title, new.summary, new.canonical_text);
END;
`

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

export function runMigrations(db: Database.Database): void {
  db.exec(MIGRATION_001)
  db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('001_initial')`).run()

  const already002 = db.prepare("SELECT id FROM schema_migrations WHERE name = '002_extensions'").get()
  if (!already002) {
    db.exec(MIGRATION_002)
    db.prepare(`INSERT INTO schema_migrations(name) VALUES ('002_extensions')`).run()
  }

  const already003 = db.prepare("SELECT id FROM schema_migrations WHERE name = '003_planning'").get()
  if (!already003) {
    db.exec(MIGRATION_003)
    db.prepare(`INSERT INTO schema_migrations(name) VALUES ('003_planning')`).run()
  }

  // Optional vector table — degrades gracefully if sqlite-vec not available
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(embedding float[1024])`)
  } catch {
    // sqlite-vec not available
  }

  const already004 = db.prepare("SELECT id FROM schema_migrations WHERE name = '004_policy'").get()
  if (!already004) {
    db.exec(MIGRATION_004)
    db.prepare(`INSERT INTO schema_migrations(name) VALUES ('004_policy')`).run()
  }
}

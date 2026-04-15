import type Database from 'better-sqlite3'

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

export function runM002(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '002_extensions'").get()
  if (!already) {
    db.exec(MIGRATION_002)
    db.prepare(`INSERT INTO schema_migrations(name) VALUES ('002_extensions')`).run()
  }
}

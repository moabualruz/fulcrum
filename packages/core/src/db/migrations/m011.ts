import type Database from 'better-sqlite3'

const MIGRATION_011_GRAPH = `
CREATE TABLE IF NOT EXISTS graph_entities (
  entity_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  valid_from TEXT,
  valid_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_graph_entities_workspace ON graph_entities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_graph_entities_type ON graph_entities(workspace_id, entity_type);

CREATE TABLE IF NOT EXISTS graph_edges (
  edge_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES graph_entities(entity_id),
  target_id TEXT NOT NULL REFERENCES graph_entities(entity_id),
  relation TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  properties TEXT NOT NULL DEFAULT '{}',
  valid_from TEXT,
  valid_until TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(workspace_id, source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(workspace_id, target_id);

CREATE TABLE IF NOT EXISTS graph_episodes (
  episode_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL REFERENCES graph_entities(entity_id),
  content TEXT NOT NULL,
  episode_type TEXT NOT NULL DEFAULT 'observation',
  valid_from TEXT,
  valid_until TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_graph_episodes_entity ON graph_episodes(workspace_id, entity_id);
`

export function runM011(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '011_graph'").get()
  if (!already) {
    db.exec(MIGRATION_011_GRAPH)
    db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('011_graph')`).run()
  }
}

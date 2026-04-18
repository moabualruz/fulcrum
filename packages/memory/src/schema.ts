// packages/memory/src/schema.ts
//
// Memory v3 migrations. Follows the TS-function convention established by
// packages/teams/src/schema.ts:runMigration006Teams() and
// packages/workflows/src/schema.ts:runMigration007Workflows():
//
//   1. DDL lives as a template-string constant.
//   2. runMigrationNNNName(db) db.exec()s the DDL with `CREATE TABLE IF NOT EXISTS`
//      / `CREATE VIEW IF NOT EXISTS` guards and PRAGMA table_info checks before
//      each ALTER TABLE ADD COLUMN (SQLite cannot make ADD COLUMN idempotent
//      on its own).
//   3. Ledger row written via INSERT OR IGNORE INTO schema_migrations(name).
//   4. Rollback SQL documented as a comment block above each forward DDL.
//
// Number block 101..104 is outside both the consolidated core range (m001..m052
// replaced by applySchema()) and the extension-package range in current use
// (006 teams, 007 workflows).

import type Database from 'better-sqlite3'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function tableColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return new Set(rows.map(r => r.name))
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  ddl: string,
): void {
  if (tableColumns(db, table).has(column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 101_memory_v3_lifecycle
//
// Rollback SQL (manual — SQLite has no native DROP COLUMN on older versions,
// but 3.35+ supports it. Dropping the view is trivial. Dropped columns restore
// their pre-migration state only by restoring the schema from backup; this
// migration is additive so a rollback typically means ignoring the new columns
// and dropping the view + table:
//
//   DROP VIEW IF EXISTS l1_pages;
//   DROP TABLE IF EXISTS l0_sources;
//   ALTER TABLE memories      DROP COLUMN retention_tier;
//   ALTER TABLE memories      DROP COLUMN confidence_decay_at;
//   ALTER TABLE memories      DROP COLUMN superseded_by;
//   ALTER TABLE memories      DROP COLUMN consolidated_from_ids;
//   ALTER TABLE graph_entities DROP COLUMN aliases;
//   ALTER TABLE graph_entities DROP COLUMN confidence;
//   ALTER TABLE graph_entities DROP COLUMN first_seen;
//   ALTER TABLE graph_entities DROP COLUMN last_confirmed;
//   ALTER TABLE graph_edges   DROP COLUMN confidence;
//   ALTER TABLE graph_edges   DROP COLUMN source_ids;
//   DELETE FROM schema_migrations WHERE name = '101_memory_v3_lifecycle';
// ─────────────────────────────────────────────────────────────────────────────

const L0_SOURCES_DDL = `
CREATE TABLE IF NOT EXISTS l0_sources (
  source_id     TEXT PRIMARY KEY,
  source_type   TEXT NOT NULL,
  session_id    TEXT,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id    TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  cwd           TEXT,
  vault_path    TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`

const L1_PAGES_VIEW_DDL = `
CREATE VIEW IF NOT EXISTS l1_pages AS
SELECT
  memory_id            AS page_id,
  kind                 AS page_type,
  workspace_id,
  project_id,
  title,
  summary,
  content              AS body,
  confidence,
  retention_tier,
  access_count,
  slug,
  vault_path,
  content_hash         AS body_hash,
  entities,
  provenance,
  supersedes,
  superseded_by,
  consolidated_from_ids,
  confidence_decay_at,
  embedded,
  schema_version,
  created_at           AS first_seen,
  updated_at           AS last_confirmed,
  last_accessed_at,
  last_recalled_at,
  recall_count,
  unique_query_count,
  max_recall_score
FROM memories
WHERE schema_version >= 3;
`

export function runMigration101MemoryV3Lifecycle(db: Database.Database): void {
  // 1. Extend memories with L1 lifecycle columns.
  addColumnIfMissing(db, 'memories', 'retention_tier',        'retention_tier TEXT')
  addColumnIfMissing(db, 'memories', 'confidence_decay_at',   'confidence_decay_at TEXT')
  addColumnIfMissing(db, 'memories', 'superseded_by',         'superseded_by TEXT')
  addColumnIfMissing(db, 'memories', 'consolidated_from_ids', 'consolidated_from_ids TEXT')

  // 2. Extend graph_entities.
  addColumnIfMissing(db, 'graph_entities', 'aliases',        'aliases TEXT')
  addColumnIfMissing(db, 'graph_entities', 'confidence',     'confidence REAL NOT NULL DEFAULT 1.0')
  addColumnIfMissing(db, 'graph_entities', 'first_seen',     'first_seen TEXT')
  addColumnIfMissing(db, 'graph_entities', 'last_confirmed', 'last_confirmed TEXT')

  // 3. Extend graph_edges.
  addColumnIfMissing(db, 'graph_edges', 'confidence', 'confidence REAL NOT NULL DEFAULT 1.0')
  addColumnIfMissing(db, 'graph_edges', 'source_ids', 'source_ids TEXT')

  // 4. l0_sources table.
  db.exec(L0_SOURCES_DDL)

  // 5. l1_pages view.
  db.exec(L1_PAGES_VIEW_DDL)

  // 6. Ledger row.
  db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('101_memory_v3_lifecycle')`).run()
}

// ─────────────────────────────────────────────────────────────────────────────
// 102_memory_v3_source_index
//
// Indexes on the columns introduced by 101. All use CREATE INDEX IF NOT EXISTS
// so re-runs are no-ops. Partial indexes (WHERE … IS NOT NULL) keep the on-disk
// footprint small while the v3 columns are still sparsely populated during
// rollout — once the PR 6 cutover flips retention_tier / confidence_decay_at to
// NOT NULL, the WHERE clauses become tautological but the index definitions
// remain valid (SQLite just ignores the always-true filter).
//
// Rollback SQL:
//
//   DROP INDEX IF EXISTS idx_l0_sources_ws_project;
//   DROP INDEX IF EXISTS idx_l0_sources_type;
//   DROP INDEX IF EXISTS idx_l0_sources_session;
//   DROP INDEX IF EXISTS idx_l0_sources_hash;
//   DROP INDEX IF EXISTS idx_l0_sources_created;
//   DROP INDEX IF EXISTS idx_memories_retention_tier;
//   DROP INDEX IF EXISTS idx_memories_superseded_by;
//   DROP INDEX IF EXISTS idx_memories_decay;
//   DROP INDEX IF EXISTS idx_graph_entities_confidence;
//   DROP INDEX IF EXISTS idx_graph_entities_last_confirmed;
//   DROP INDEX IF EXISTS idx_graph_edges_confidence;
//   DELETE FROM schema_migrations WHERE name = '102_memory_v3_source_index';
// ─────────────────────────────────────────────────────────────────────────────

const V3_INDEXES_DDL = `
-- l0_sources
CREATE INDEX IF NOT EXISTS idx_l0_sources_ws_project ON l0_sources(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_l0_sources_type       ON l0_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_l0_sources_session    ON l0_sources(session_id)   WHERE session_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_l0_sources_hash       ON l0_sources(content_hash);
CREATE INDEX IF NOT EXISTS idx_l0_sources_created    ON l0_sources(created_at);

-- memories (v3 lifecycle columns — all partial while rollout is in flight)
CREATE INDEX IF NOT EXISTS idx_memories_retention_tier ON memories(retention_tier)      WHERE retention_tier      IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_superseded_by  ON memories(superseded_by)       WHERE superseded_by       IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_decay          ON memories(confidence_decay_at) WHERE confidence_decay_at IS NOT NULL;

-- graph_entities (v3 columns)
CREATE INDEX IF NOT EXISTS idx_graph_entities_confidence     ON graph_entities(confidence);
CREATE INDEX IF NOT EXISTS idx_graph_entities_last_confirmed ON graph_entities(last_confirmed) WHERE last_confirmed IS NOT NULL;

-- graph_edges (v3 columns)
CREATE INDEX IF NOT EXISTS idx_graph_edges_confidence ON graph_edges(confidence);
`

export function runMigration102MemoryV3SourceIndex(db: Database.Database): void {
  db.exec(V3_INDEXES_DDL)
  db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('102_memory_v3_source_index')`).run()
}

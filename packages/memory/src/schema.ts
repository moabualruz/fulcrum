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

// ─────────────────────────────────────────────────────────────────────────────
// 103_memory_v3_cutover
//
// Table-rebuild dance that flips retention_tier + confidence_decay_at to
// NOT NULL. Follows the `rebuildMemoriesIfLegacy` pattern in core/src/db/
// schema.ts — drop dependent FTS5 triggers + l1_pages view, create the new
// table with NOT NULL constraints, copy every row explicitly by column
// name, DROP + RENAME, recreate triggers + view + indexes. All inside one
// BEGIN IMMEDIATE transaction so a failure leaves the legacy table intact.
//
// Pre-requisites:
//   * runMigration101MemoryV3Lifecycle must have added the four v3 columns.
//   * PR 6.3 backfill must have either bumped retention_tier on L1 rows or
//     deleted L0-class rows — any remaining NULL retention_tier causes the
//     INSERT INTO memories_new to violate NOT NULL and rolls the txn back.
//
// canonical_text stays (plan §6.4 explicitly defers its drop to 9.3 to
// avoid coupling the cutover to FTS5 trigger rewiring).
//
// Rollback SQL:
//
//   -- Recreate memories with the pre-103 schema (retention_tier +
//   -- confidence_decay_at nullable). Use the same table-rebuild dance.
//   BEGIN IMMEDIATE;
//   DROP VIEW IF EXISTS l1_pages;
//   DROP TRIGGER IF EXISTS memories_ai;
//   DROP TRIGGER IF EXISTS memories_ad;
//   DROP TRIGGER IF EXISTS memories_au;
//   ALTER TABLE memories RENAME TO memories_v3;
//   -- CREATE TABLE memories (... retention_tier TEXT, confidence_decay_at TEXT ...);
//   -- INSERT INTO memories SELECT <columns> FROM memories_v3;
//   DROP TABLE memories_v3;
//   -- Recreate triggers + view + indexes.
//   DELETE FROM schema_migrations WHERE name = '103_memory_v3_cutover';
//   COMMIT;
// ─────────────────────────────────────────────────────────────────────────────

// Full v3 memories schema with retention_tier + confidence_decay_at flipped
// NOT NULL. Mirrors core/src/db/schema.ts CREATE TABLE memories plus the four
// columns added by runMigration101MemoryV3Lifecycle. Kept in sync with the
// core DDL; schema drift is caught by schema-v3-cutover.test.ts.
const MEMORIES_V3_DDL = `
CREATE TABLE memories_new (
  memory_id        TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id       TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  scope            TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('session','project','workspace','global','file','task')),
  kind             TEXT NOT NULL DEFAULT 'fact',
  title            TEXT NOT NULL DEFAULT '',
  summary          TEXT NOT NULL DEFAULT '',
  content          TEXT NOT NULL,
  canonical_text   TEXT,
  tags             TEXT NOT NULL DEFAULT '[]',
  entities         TEXT NOT NULL DEFAULT '[]',
  confidence       REAL NOT NULL DEFAULT 1.0,
  importance       REAL NOT NULL DEFAULT 0.5,
  freshness        REAL NOT NULL DEFAULT 1.0,
  file_path        TEXT,
  symbol_path      TEXT,
  event_time       TEXT,
  content_hash     TEXT,
  task_id          TEXT,
  issue_id         TEXT,
  artifact_id      TEXT,
  provenance_refs  TEXT NOT NULL DEFAULT '[]',
  session_id       TEXT,
  content_type     TEXT NOT NULL DEFAULT 'text',
  sparse_vector    TEXT,
  source           TEXT NOT NULL DEFAULT 'manual',
  embedding        BLOB,
  access_count     INTEGER NOT NULL DEFAULT 0,
  tier             TEXT NOT NULL DEFAULT 'short_term',
  slug             TEXT NOT NULL DEFAULT (lower(hex(randomblob(8)))),
  vault_path       TEXT NOT NULL DEFAULT '',
  provenance       TEXT NOT NULL DEFAULT '{}',
  supersedes       TEXT,
  recall_count     INTEGER NOT NULL DEFAULT 0,
  unique_query_count INTEGER NOT NULL DEFAULT 0,
  max_recall_score REAL NOT NULL DEFAULT 0.0,
  last_recalled_at INTEGER,
  embedded         INTEGER NOT NULL DEFAULT 0,
  schema_version   INTEGER NOT NULL DEFAULT 1,
  normalize_version INTEGER NOT NULL DEFAULT 1,
  expires_at       INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
  retention_tier   TEXT NOT NULL,
  confidence_decay_at TEXT NOT NULL,
  superseded_by    TEXT,
  consolidated_from_ids TEXT
);
`

const MEMORIES_COLUMNS = [
  'memory_id', 'workspace_id', 'project_id', 'scope', 'kind', 'title', 'summary', 'content',
  'canonical_text', 'tags', 'entities', 'confidence', 'importance', 'freshness',
  'file_path', 'symbol_path', 'event_time', 'content_hash', 'task_id', 'issue_id',
  'artifact_id', 'provenance_refs', 'session_id', 'content_type', 'sparse_vector',
  'source', 'embedding', 'access_count', 'tier', 'slug', 'vault_path',
  'provenance', 'supersedes', 'recall_count', 'unique_query_count', 'max_recall_score',
  'last_recalled_at', 'embedded', 'schema_version', 'normalize_version', 'expires_at',
  'created_at', 'updated_at', 'last_accessed_at',
  'retention_tier', 'confidence_decay_at', 'superseded_by', 'consolidated_from_ids',
].join(', ')

export function runMigration103MemoryV3Cutover(db: Database.Database): void {
  // Idempotency guard 1 — ledger row already written.
  const applied = db.prepare(
    `SELECT 1 AS present FROM schema_migrations WHERE name = ?`,
  ).get('103_memory_v3_cutover') as { present: number } | undefined
  if (applied) return

  // Idempotency guard 2 — schema already rebuilt (retention_tier is NOT NULL).
  const retentionInfo = (db.prepare(`PRAGMA table_info(memories)`).all() as {
    name: string
    notnull: number
  }[]).find(c => c.name === 'retention_tier')
  if (!retentionInfo) return // fresh DB — 101 not applied, 103 has nothing to do
  if (retentionInfo.notnull === 1) {
    db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('103_memory_v3_cutover')`).run()
    return
  }

  // Capture indexes on memories so we can recreate them after the swap.
  // Partial-index WHERE clauses and UNIQUE modifiers survive verbatim via
  // sqlite_master.sql. Auto-indexes (rowid PK) have sql=NULL and are skipped.
  const indexRows = db.prepare(
    `SELECT name, sql FROM sqlite_master
     WHERE type='index' AND tbl_name='memories' AND sql IS NOT NULL`,
  ).all() as { name: string; sql: string }[]
  const viewRow = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='view' AND name='l1_pages'`,
  ).get() as { sql: string } | undefined

  db.exec('BEGIN IMMEDIATE')
  try {
    // Drop dependent objects first — triggers and views reference the old table.
    db.exec(`DROP VIEW IF EXISTS l1_pages`)
    for (const t of ['memories_ai', 'memories_ad', 'memories_au']) {
      db.exec(`DROP TRIGGER IF EXISTS ${t}`)
    }

    // New table with NOT NULL on the two lifecycle columns.
    db.exec(MEMORIES_V3_DDL)

    // Column-by-column copy. If retention_tier is NULL on any row the NOT NULL
    // constraint rejects it — we let the throw propagate so the outer catch
    // rolls everything back and surfaces the failure.
    db.exec(`INSERT INTO memories_new (${MEMORIES_COLUMNS}) SELECT ${MEMORIES_COLUMNS} FROM memories`)

    db.exec('DROP TABLE memories')
    db.exec('ALTER TABLE memories_new RENAME TO memories')

    // Recreate indexes (DROP TABLE removed them implicitly).
    for (const idx of indexRows) db.exec(idx.sql)

    // Recreate l1_pages view.
    if (viewRow?.sql) db.exec(viewRow.sql)

    // Recreate FTS5 triggers. Same shape as core/src/db/schema.ts.
    db.exec(`
      CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, title, summary, canonical_text) VALUES (new.rowid, new.content, new.title, new.summary, new.canonical_text);
      END;
      CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, title, summary, canonical_text) VALUES ('delete', old.rowid, old.content, old.title, old.summary, old.canonical_text);
      END;
      CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, title, summary, canonical_text) VALUES ('delete', old.rowid, old.content, old.title, old.summary, old.canonical_text);
        INSERT INTO memories_fts(rowid, content, title, summary, canonical_text) VALUES (new.rowid, new.content, new.title, new.summary, new.canonical_text);
      END;
    `)

    db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('103_memory_v3_cutover')`).run()

    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 104_memory_v3_drop_canonical_text
//
// Table-rebuild dance that drops the legacy `memories.canonical_text` column
// and rewires the FTS5 shadow table + triggers to index `content` / `title` /
// `summary` only. v2a used canonical_text to pre-tokenize code identifiers
// for FTS5 recall (camelCase → "camel Case"); v3 L0 ingest is verbatim and
// the curator owns its own per-page body, so the extra column is dead weight.
//
// Unlike 103, this migration MUST rebuild the memories_fts virtual table —
// SQLite cannot ALTER an FTS5 table's column list. Dropping it clears the
// shadow tables (memories_fts_{data,idx,docsize,config,content}); the
// recreated memories_fts is backfilled via `INSERT … VALUES ('rebuild')`
// so every surviving row gets an up-to-date FTS5 index entry.
//
// Pre-requisites:
//   * Migrations 101 and 103 must have run (the v3 lifecycle columns exist
//     and retention_tier / confidence_decay_at are NOT NULL).
//
// Rollback SQL (sketch — pre-104 schema restoration):
//
//   BEGIN IMMEDIATE;
//   DROP VIEW IF EXISTS l1_pages;
//   DROP TRIGGER IF EXISTS memories_ai;
//   DROP TRIGGER IF EXISTS memories_ad;
//   DROP TRIGGER IF EXISTS memories_au;
//   DROP TABLE IF EXISTS memories_fts;
//   ALTER TABLE memories RENAME TO memories_v3;
//   -- CREATE TABLE memories (... canonical_text TEXT, ...);  (pre-104 shape)
//   -- INSERT INTO memories (<cols>, canonical_text) SELECT <cols>, content FROM memories_v3;
//   DROP TABLE memories_v3;
//   -- Recreate memories_fts with canonical_text column + matching triggers;
//   -- then INSERT INTO memories_fts(memories_fts) VALUES ('rebuild');
//   DELETE FROM schema_migrations WHERE name = '104_memory_v3_drop_canonical_text';
//   COMMIT;
//
// The rollback restores the column but the historical tokenisation of each
// row's canonical_text cannot be recovered without re-running normalizeCodeText;
// for CODE_KINDS that's trivial, for prose it was always equal to content.
// ─────────────────────────────────────────────────────────────────────────────

// Full v3 memories schema matching MEMORIES_V3_DDL minus canonical_text.
const MEMORIES_V3_NO_CANONICAL_DDL = `
CREATE TABLE memories_new (
  memory_id        TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id       TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  scope            TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('session','project','workspace','global','file','task')),
  kind             TEXT NOT NULL DEFAULT 'fact',
  title            TEXT NOT NULL DEFAULT '',
  summary          TEXT NOT NULL DEFAULT '',
  content          TEXT NOT NULL,
  tags             TEXT NOT NULL DEFAULT '[]',
  entities         TEXT NOT NULL DEFAULT '[]',
  confidence       REAL NOT NULL DEFAULT 1.0,
  importance       REAL NOT NULL DEFAULT 0.5,
  freshness        REAL NOT NULL DEFAULT 1.0,
  file_path        TEXT,
  symbol_path      TEXT,
  event_time       TEXT,
  content_hash     TEXT,
  task_id          TEXT,
  issue_id         TEXT,
  artifact_id      TEXT,
  provenance_refs  TEXT NOT NULL DEFAULT '[]',
  session_id       TEXT,
  content_type     TEXT NOT NULL DEFAULT 'text',
  sparse_vector    TEXT,
  source           TEXT NOT NULL DEFAULT 'manual',
  embedding        BLOB,
  access_count     INTEGER NOT NULL DEFAULT 0,
  tier             TEXT NOT NULL DEFAULT 'short_term',
  slug             TEXT NOT NULL DEFAULT (lower(hex(randomblob(8)))),
  vault_path       TEXT NOT NULL DEFAULT '',
  provenance       TEXT NOT NULL DEFAULT '{}',
  supersedes       TEXT,
  recall_count     INTEGER NOT NULL DEFAULT 0,
  unique_query_count INTEGER NOT NULL DEFAULT 0,
  max_recall_score REAL NOT NULL DEFAULT 0.0,
  last_recalled_at INTEGER,
  embedded         INTEGER NOT NULL DEFAULT 0,
  schema_version   INTEGER NOT NULL DEFAULT 1,
  normalize_version INTEGER NOT NULL DEFAULT 1,
  expires_at       INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
  retention_tier   TEXT NOT NULL,
  confidence_decay_at TEXT NOT NULL,
  superseded_by    TEXT,
  consolidated_from_ids TEXT
);
`

const MEMORIES_COLUMNS_NO_CANONICAL = [
  'memory_id', 'workspace_id', 'project_id', 'scope', 'kind', 'title', 'summary', 'content',
  'tags', 'entities', 'confidence', 'importance', 'freshness',
  'file_path', 'symbol_path', 'event_time', 'content_hash', 'task_id', 'issue_id',
  'artifact_id', 'provenance_refs', 'session_id', 'content_type', 'sparse_vector',
  'source', 'embedding', 'access_count', 'tier', 'slug', 'vault_path',
  'provenance', 'supersedes', 'recall_count', 'unique_query_count', 'max_recall_score',
  'last_recalled_at', 'embedded', 'schema_version', 'normalize_version', 'expires_at',
  'created_at', 'updated_at', 'last_accessed_at',
  'retention_tier', 'confidence_decay_at', 'superseded_by', 'consolidated_from_ids',
].join(', ')

export function runMigration104MemoryV3DropCanonicalText(db: Database.Database): void {
  // Idempotency guard 1 — ledger row already written.
  const applied = db.prepare(
    `SELECT 1 AS present FROM schema_migrations WHERE name = ?`,
  ).get('104_memory_v3_drop_canonical_text') as { present: number } | undefined
  if (applied) return

  // Idempotency guard 2 — column already absent (fresh DB on post-9.3 code,
  // or a prior partial rebuild). Record the ledger row so re-runs stay fast.
  const memoryCols = tableColumns(db, 'memories')
  if (memoryCols.size === 0) return // no memories table at all — nothing to do
  if (!memoryCols.has('canonical_text')) {
    db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('104_memory_v3_drop_canonical_text')`).run()
    return
  }

  // Capture indexes + view so we can recreate them after the swap. 103's
  // comment block documents why we read SQL straight from sqlite_master.
  const indexRows = db.prepare(
    `SELECT name, sql FROM sqlite_master
     WHERE type='index' AND tbl_name='memories' AND sql IS NOT NULL`,
  ).all() as { name: string; sql: string }[]
  const viewRow = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='view' AND name='l1_pages'`,
  ).get() as { sql: string } | undefined

  db.exec('BEGIN IMMEDIATE')
  try {
    // Drop dependent objects. Triggers + view reference memories columns;
    // memories_fts has a 4-column schema (content/title/summary/canonical_text)
    // that we cannot ALTER — DROP + recreate with 3 columns below.
    db.exec(`DROP VIEW IF EXISTS l1_pages`)
    for (const t of ['memories_ai', 'memories_ad', 'memories_au']) {
      db.exec(`DROP TRIGGER IF EXISTS ${t}`)
    }
    db.exec(`DROP TABLE IF EXISTS memories_fts`)

    // New memories table — same as post-103 minus canonical_text.
    db.exec(MEMORIES_V3_NO_CANONICAL_DDL)

    db.exec(`INSERT INTO memories_new (${MEMORIES_COLUMNS_NO_CANONICAL}) SELECT ${MEMORIES_COLUMNS_NO_CANONICAL} FROM memories`)

    db.exec('DROP TABLE memories')
    db.exec('ALTER TABLE memories_new RENAME TO memories')

    // Recreate indexes (DROP TABLE removed them implicitly).
    for (const idx of indexRows) db.exec(idx.sql)

    // Recreate l1_pages view.
    if (viewRow?.sql) db.exec(viewRow.sql)

    // Recreate memories_fts + FTS5 triggers without canonical_text.
    db.exec(`
      CREATE VIRTUAL TABLE memories_fts USING fts5(
        content, title, summary,
        content='memories', content_rowid='rowid'
      );
      CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, title, summary) VALUES (new.rowid, new.content, new.title, new.summary);
      END;
      CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, title, summary) VALUES ('delete', old.rowid, old.content, old.title, old.summary);
      END;
      CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, title, summary) VALUES ('delete', old.rowid, old.content, old.title, old.summary);
        INSERT INTO memories_fts(rowid, content, title, summary) VALUES (new.rowid, new.content, new.title, new.summary);
      END;
    `)

    // Rebuild the FTS5 index from the memories rows that survived the swap.
    db.exec(`INSERT INTO memories_fts(memories_fts) VALUES ('rebuild')`)

    db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('104_memory_v3_drop_canonical_text')`).run()

    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

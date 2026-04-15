import type Database from 'better-sqlite3'

// MIGRATION_005 — memory enrichment (ALTER TABLE is idempotent via try/catch per column).
// Each ALTER TABLE statement is executed individually with try/catch because
// ALTER TABLE ADD COLUMN throws if a column already exists (e.g. on DBs created
// after MIGRATION_002 which already added some of these columns).
const MIGRATION_005 = `
-- Extend memories table with enriched fields (idempotent ALTERs)
ALTER TABLE memories ADD COLUMN scope TEXT NOT NULL DEFAULT 'project'
  CHECK(scope IN ('global','project','file'));
ALTER TABLE memories ADD COLUMN kind TEXT NOT NULL DEFAULT 'fact'
  CHECK(kind IN ('fact','summary','symbol','decision','procedure',
                 'error','diff','doc','code',
                 'task_goal','task_decision','task_failure','task_outcome'));
ALTER TABLE memories ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE memories ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE memories ADD COLUMN canonical_text TEXT;
ALTER TABLE memories ADD COLUMN file_path TEXT;
ALTER TABLE memories ADD COLUMN symbol_path TEXT;
ALTER TABLE memories ADD COLUMN entities TEXT NOT NULL DEFAULT '[]';
ALTER TABLE memories ADD COLUMN event_time TEXT;
ALTER TABLE memories ADD COLUMN content_hash TEXT;
ALTER TABLE memories ADD COLUMN task_id TEXT;
ALTER TABLE memories ADD COLUMN issue_id TEXT;
ALTER TABLE memories ADD COLUMN artifact_id TEXT;
ALTER TABLE memories ADD COLUMN provenance_refs TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_memories_scope      ON memories(scope);
CREATE INDEX IF NOT EXISTS idx_memories_kind       ON memories(kind);
CREATE INDEX IF NOT EXISTS idx_memories_file       ON memories(file_path);
CREATE INDEX IF NOT EXISTS idx_memories_hash       ON memories(content_hash);
CREATE INDEX IF NOT EXISTS idx_memories_event_time ON memories(event_time);

-- memory_entities: flexible entity linking
CREATE TABLE IF NOT EXISTS memory_entities (
  memory_id     TEXT NOT NULL REFERENCES memories(memory_id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'subject_of',
  PRIMARY KEY (memory_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_memory_entities_entity ON memory_entities(entity_type, entity_id);

-- code_chunks: RAG ingestion index
CREATE TABLE IF NOT EXISTS code_chunks (
  chunk_id       TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  project_id     TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  file_path      TEXT NOT NULL,
  language       TEXT,
  chunk_strategy TEXT NOT NULL CHECK(chunk_strategy IN ('syntax','semantic','token')),
  source_type    TEXT NOT NULL CHECK(source_type IN ('code','prose')),
  content        TEXT NOT NULL,
  start_line     INTEGER,
  end_line       INTEGER,
  symbol_path    TEXT,
  embedding      BLOB,
  content_hash   TEXT,
  indexed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chunks_project ON code_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_chunks_file    ON code_chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_chunks_hash    ON code_chunks(content_hash);
`

export function runM005(db: Database.Database): void {
  const migration005Stmts = MIGRATION_005.split(';').map(s => s.trim()).filter(Boolean)
  for (const stmt of migration005Stmts) {
    try {
      db.exec(stmt + ';')
    } catch (err) {
      // ALTER TABLE ADD COLUMN throws if column already exists — safe to ignore
      const msg = (err as { message?: string }).message ?? ''
      if (!msg.includes('duplicate column name') && !msg.includes('already exists')) {
        throw err
      }
    }
  }
  db.prepare(`INSERT OR IGNORE INTO schema_migrations(name) VALUES ('005_memory_enrichment')`).run()
}

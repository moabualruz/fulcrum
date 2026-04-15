import type Database from 'better-sqlite3'

// MIGRATION_052 — memories: add source column (Feature 3).
//
// Tracks whether a memory was written manually, automatically by run
// lifecycle hooks (completeAgentRun / blockAgentRun), or by the setup
// installer. Allows callers to filter auto-written entries from search
// results and surfaces provenance in recall_memory responses.
//
// SQLite has no IF NOT EXISTS for columns — the duplicate-column guard
// follows the established pattern used in m005, m020, etc.
export function runM052(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '052_memories_source'").get()
  if (already) return

  const now = Math.floor(Date.now() / 1000)

  try {
    db.exec(`ALTER TABLE memories ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`)
  } catch (err) {
    // 'duplicate column name' means the column already exists — idempotent
    if (!(err as Error).message?.includes('duplicate column name')) throw err
  }

  db.prepare("INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES ('052_memories_source', ?)")
    .run(now)
}

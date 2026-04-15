import type Database from 'better-sqlite3'

// MIGRATION_032 — add session_id column to memories for session-scoped recall
export function runM032(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '032_memories_session_id'").get()
  if (!already) {
    try {
      db.exec(`ALTER TABLE memories ADD COLUMN session_id TEXT`)
    } catch {
      // Column may already exist on some databases — ignore
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id) WHERE session_id IS NOT NULL`)
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('032_memories_session_id')").run()
  }
}

import type Database from 'better-sqlite3'

// MIGRATION_033 — add content_type column to memories ('text' | 'code', default 'text').
// Enables routing embeddings to the text vs code provider at write time.
export function runM033(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '033_memories_content_type'").get()
  if (!already) {
    try {
      db.exec(`ALTER TABLE memories ADD COLUMN content_type TEXT NOT NULL DEFAULT 'text'`)
    } catch {
      // Column may already exist — ignore
    }
    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('033_memories_content_type')").run()
  }
}

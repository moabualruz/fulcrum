import type Database from 'better-sqlite3'

// MIGRATION_048 — memories: add sparse_vector column for GAP-RAG-7.
//
// Adds a TEXT column `sparse_vector` to the memories table. The column stores
// a JSON object mapping term strings to their L2-normalised log-TF weights
// (produced by computeSparseVector() in @fulcrum/memory/sparse.ts).
//
// The sparse vector acts as a 3rd retrieval signal in the L1 recall RRF fusion
// alongside FTS5 BM25 and dense vector similarity.
//
// Column defaults to NULL — existing rows are backfilled asynchronously by the
// first recall that touches them, or can be rebuilt via `fulcrum memory rebuild`.
export function runM048(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '048_memories_sparse_vector'").get()
  if (already) return

  const now = Math.floor(Date.now() / 1000)

  // Add sparse_vector column — idempotent via the migration guard above.
  db.exec(`ALTER TABLE memories ADD COLUMN sparse_vector TEXT`)

  db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES ('048_memories_sparse_vector', ?)")
    .run(now)
}

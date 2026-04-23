// packages/cli/src/commands/memory-reindex-l2.ts
//
// Memory v3 PR 4 unit 4.3 — operator one-shot re-embedder.
//
// Walks `memories` (WHERE schema_version >= 3) and re-embeds every L1 page
// body into `vec_memories`. Optionally also walks `code_chunks` and re-embeds
// into `vec_chunks`. Distinct from `fulcrum memory embed`, which only fills
// rows with NULL embeddings; this command unconditionally rewrites the
// vector for every matching row — the intended use is recovery after an
// embedder/model swap or an L2 corruption.

import { getDb } from 'fulcrum-agent-core'
import { storeEmbeddingInVec, storeChunkEmbedding } from 'fulcrum-memory'

export interface ReindexL2Input {
  pages?: boolean
  code?: boolean
}

export interface ReindexL2ScopeStats {
  scanned: number
  embedded: number
  failed: number
}

export interface ReindexL2Result {
  pages: ReindexL2ScopeStats
  code: ReindexL2ScopeStats
}

const EMPTY: ReindexL2ScopeStats = Object.freeze({ scanned: 0, embedded: 0, failed: 0 })

export async function reindexL2(input: ReindexL2Input = {}): Promise<ReindexL2Result> {
  // Neither flag set → do both (the default "full reindex" behaviour the
  // plan's Verify gate expects). Either flag set → only that scope.
  const bothImplied = !input.pages && !input.code
  const doPages = Boolean(input.pages) || bothImplied
  const doCode = Boolean(input.code) || bothImplied

  const pagesStats = doPages ? await reindexPages() : { ...EMPTY }
  const codeStats = doCode ? await reindexCode() : { ...EMPTY }
  return { pages: pagesStats, code: codeStats }
}

async function reindexPages(): Promise<ReindexL2ScopeStats> {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT memory_id, content FROM memories
       WHERE schema_version >= 3
       ORDER BY created_at`,
    )
    .all() as Array<{ memory_id: string; content: string }>
  const stats: ReindexL2ScopeStats = { scanned: rows.length, embedded: 0, failed: 0 }
  for (const row of rows) {
    try {
      clearMemoryVector(db, row.memory_id)
      await storeEmbeddingInVec(db, row.memory_id, row.content ?? '')
      if (verifyMemoryVector(db, row.memory_id)) {
        stats.embedded++
      } else {
        stats.failed++
      }
    } catch {
      stats.failed++
    }
  }
  return stats
}

function clearMemoryVector(db: ReturnType<typeof getDb>, memoryId: string): void {
  db.prepare('DELETE FROM vec_memories WHERE memory_id = ?').run(memoryId)
  db.prepare('UPDATE memories SET embedding = NULL WHERE memory_id = ?').run(memoryId)
}

function verifyMemoryVector(db: ReturnType<typeof getDb>, memoryId: string): boolean {
  const vec = db.prepare('SELECT 1 FROM vec_memories WHERE memory_id = ?').get(memoryId) as { 1: number } | undefined
  const row = db.prepare('SELECT embedding FROM memories WHERE memory_id = ?').get(memoryId) as { embedding: Buffer | null } | undefined
  return Boolean(vec && row?.embedding)
}

async function reindexCode(): Promise<ReindexL2ScopeStats> {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT chunk_id, content FROM code_chunks
       ORDER BY indexed_at`,
    )
    .all() as Array<{ chunk_id: string; content: string }>
  const stats: ReindexL2ScopeStats = { scanned: rows.length, embedded: 0, failed: 0 }
  for (const row of rows) {
    try {
      const result = await storeChunkEmbedding(db, row.chunk_id, row.content ?? '')
      if (result.status === 'embedded' && result.vector_row_verified && result.metadata_verified) {
        stats.embedded++
      } else {
        stats.failed++
      }
    } catch {
      stats.failed++
    }
  }
  return stats
}

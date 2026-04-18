// packages/memory/src/l2/embed.ts
//
// L2 — embed an L1 memory body into vec_memories (+ mirror the vector onto
// the memories row for inspection / rebuild). Fire-and-forget: callers wrap
// this in enqueueEmbed (see ./queue) so the ONNX worker stays inside the
// EMBED_CONCURRENCY cap. Non-fatal when the embedder is unavailable.
//
// Moved from packages/memory/src/write.ts during PR 4 unit 4.1.

import type { Db } from 'fulcrum-agent-core'
import { getTextEmbedder } from 'fulcrum-agent-core'
import { enqueueEmbed } from './queue.js'

/**
 * Enqueue an L1 page embedding through the shared embed queue. Fire-and-forget:
 * the caller returns immediately and flushPendingMemoryWrites drains the queue
 * before CLI exit. Reads the page body from the `memories` row (schema_version
 * >= 3) so the caller doesn't have to re-plumb the text.
 *
 * Called by the curator apply-layer after each createCuratedPage /
 * updateCuratedPage / supersedeCuratedPage. Safe post-rollback: if the
 * memories row is gone by the time the queue runs, storeEmbeddingInVec's
 * existence-check short-circuits without writing.
 */
export function recordL1Embedding(db: Db, page_id: string): void {
  void enqueueEmbed(async () => {
    const row = db
      .prepare('SELECT content FROM memories WHERE memory_id = ? AND schema_version >= 3')
      .get(page_id) as { content: string } | undefined
    if (!row) return
    await storeEmbeddingInVec(db, page_id, row.content)
  }).catch((err: unknown) => {
    process.stderr.write(`[embed] L1 page ${page_id}: ${err instanceof Error ? err.message : String(err)}\n`)
  })
}

export async function storeEmbeddingInVec(db: Db, memory_id: string, text: string): Promise<void> {
  const embedder = getTextEmbedder()
  if (!embedder) {
    if (process.env['FULCRUM_VERBOSE']) {
      process.stderr.write(`[embed] skipped ${memory_id}: no embedder registered\n`)
    }
    return
  }
  try {
    const exists = db.prepare('SELECT 1 FROM memories WHERE memory_id = ?').get(memory_id)
    if (!exists) return
    const embedFn = (embedder.embedDocument ?? embedder.embed).bind(embedder)
    const vec = await embedFn(text)
    const buf = Buffer.from(vec.buffer)
    // vec0 virtual tables do NOT honour INSERT OR REPLACE — repeat inserts
    // for the same memory_id trigger a UNIQUE constraint failure instead
    // of replacing. Explicit DELETE + INSERT gives us upsert semantics and
    // matches the pattern already used in packages/memory/src/sweep.ts.
    db.prepare('DELETE FROM vec_memories WHERE memory_id = ?').run(memory_id)
    db.prepare('INSERT INTO vec_memories(memory_id, embedding) VALUES (?, ?)').run(memory_id, buf)
    db.prepare('UPDATE memories SET embedding = ? WHERE memory_id = ?').run(buf, memory_id)
  } catch (err) {
    // Silent failures hide real bugs (missing sqlite-vec, dim mismatch, disk
    // full). Log once per error so ops notice.
    process.stderr.write(`[embed] ${memory_id} failed: ${err instanceof Error ? err.message : String(err)}\n`)
  }
}

// packages/memory/src/l2/code.ts
//
// L2 — embed a code_chunks row into vec_chunks (+ mirror onto code_chunks.
// embedding). Parallel to ./embed.storeEmbeddingInVec. `scheduleChunkEmbedding`
// is the fire-and-forget entry point used by the indexer and ingest pipelines
// — it pushes through ./queue.enqueueEmbed so the embed worker stays bounded.
//
// Moved from packages/memory/src/write.ts during PR 4 unit 4.1. The code_chunks
// embedding path is intentionally left in place (plan §PR 4 — "embed L1 pages,
// keep code_chunks"): vec_chunks remains fed by the indexer daemon.

import type { Db } from 'fulcrum-agent-core'
import { getTextEmbedder } from 'fulcrum-agent-core'
import { enqueueEmbed } from './queue.js'

let _chunkEmbedLoggedOnce = false

export async function storeChunkEmbedding(db: Db, chunk_id: string, text: string): Promise<void> {
  const embedder = getTextEmbedder()
  if (!embedder) {
    if (!_chunkEmbedLoggedOnce) {
      _chunkEmbedLoggedOnce = true
      process.stderr.write(`[embed] no embedder registered — chunk embeddings disabled (first chunk ${chunk_id})\n`)
    }
    return
  }
  try {
    const exists = db.prepare('SELECT 1 FROM code_chunks WHERE chunk_id = ?').get(chunk_id)
    if (!exists) return
    const embedFn = (embedder.embedDocument ?? embedder.embed).bind(embedder)
    const vec = await embedFn(text)
    const buf = Buffer.from(vec.buffer)
    db.prepare('INSERT OR REPLACE INTO vec_chunks(chunk_id, embedding) VALUES (?, ?)').run(chunk_id, buf)
    db.prepare('UPDATE code_chunks SET embedding = ? WHERE chunk_id = ?').run(buf, chunk_id)
  } catch (err) {
    process.stderr.write(`[embed] chunk ${chunk_id} failed: ${err instanceof Error ? err.message : String(err)}\n`)
  }
}

/**
 * Enqueue a chunk embedding — bounded concurrency (EMBED_CONCURRENCY).
 * Returns immediately; the embedding runs when a slot frees up. CLI callers
 * drain via flushPendingMemoryWrites before exit. Prevents the ONNX deadlock
 * observed when thousands of concurrent embeds pile up.
 */
export function scheduleChunkEmbedding(db: Db, chunk_id: string, text: string): void {
  void enqueueEmbed(() => storeChunkEmbedding(db, chunk_id, text))
    .catch((err: unknown) => {
      process.stderr.write(`[embed] chunk ${chunk_id}: ${err instanceof Error ? err.message : String(err)}\n`)
    })
}

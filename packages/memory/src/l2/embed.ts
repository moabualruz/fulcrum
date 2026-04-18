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
    db.prepare('INSERT OR REPLACE INTO vec_memories(memory_id, embedding) VALUES (?, ?)').run(memory_id, buf)
    db.prepare('UPDATE memories SET embedding = ? WHERE memory_id = ?').run(buf, memory_id)
  } catch (err) {
    // Silent failures hide real bugs (missing sqlite-vec, dim mismatch, disk
    // full). Log once per error so ops notice.
    process.stderr.write(`[embed] ${memory_id} failed: ${err instanceof Error ? err.message : String(err)}\n`)
  }
}

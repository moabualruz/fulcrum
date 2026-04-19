// packages/memory/src/tests/l2-relocation.test.ts
//
// PR 4 unit 4.1 — pins the relocation of storeEmbeddingInVec /
// storeChunkEmbedding / scheduleChunkEmbedding / flushPendingMemoryWrites /
// waitForEmbedHeadroom out of `write.ts` and into `packages/memory/src/l2/`.
//
// Two invariants:
//   1. Every moved symbol keeps its name in the `fulcrum-memory` barrel.
//   2. The new `./l2/{queue,embed,code}` module paths export the same
//      references (same function identity — no duplicated definitions).

import { describe, it, expect } from 'vitest'
import * as barrel from '../index.js'
import * as l2Queue from '../l2/queue.js'
import * as l2Embed from '../l2/embed.js'
import * as l2Code from '../l2/code.js'

describe('PR 4.1 — l2 relocation', () => {
  it('exposes storeEmbeddingInVec from l2/embed and the barrel (same ref)', () => {
    expect(typeof l2Embed.storeEmbeddingInVec).toBe('function')
    expect(barrel.storeEmbeddingInVec).toBe(l2Embed.storeEmbeddingInVec)
  })

  it('exposes storeChunkEmbedding + scheduleChunkEmbedding from l2/code (same ref)', () => {
    expect(typeof l2Code.storeChunkEmbedding).toBe('function')
    expect(typeof l2Code.scheduleChunkEmbedding).toBe('function')
    expect(barrel.storeChunkEmbedding).toBe(l2Code.storeChunkEmbedding)
    expect(barrel.scheduleChunkEmbedding).toBe(l2Code.scheduleChunkEmbedding)
  })

  it('exposes flushPendingMemoryWrites + waitForEmbedHeadroom from l2/queue (same ref)', () => {
    expect(typeof l2Queue.flushPendingMemoryWrites).toBe('function')
    expect(typeof l2Queue.waitForEmbedHeadroom).toBe('function')
    expect(barrel.flushPendingMemoryWrites).toBe(l2Queue.flushPendingMemoryWrites)
    expect(barrel.waitForEmbedHeadroom).toBe(l2Queue.waitForEmbedHeadroom)
  })

  it('enqueueEmbed and trackAsyncWork are internal to l2/queue (not barrel-exported)', () => {
    expect(typeof l2Queue.enqueueEmbed).toBe('function')
    expect(typeof l2Queue.trackAsyncWork).toBe('function')
    expect((barrel as Record<string, unknown>)['enqueueEmbed']).toBeUndefined()
    expect((barrel as Record<string, unknown>)['trackAsyncWork']).toBeUndefined()
  })

  // PR 9.2 — write.js no longer re-exports the l2 helpers. The shim that
  // PR 4.1 left behind for cli/pci/indexer back-compat has been removed
  // now that every internal import points at l2/ directly.
  it('write.js does NOT re-export the l2 shim symbols (PR 9.2)', async () => {
    const writeMod = (await import('../write.js')) as Record<string, unknown>
    expect(writeMod['storeEmbeddingInVec']).toBeUndefined()
    expect(writeMod['storeChunkEmbedding']).toBeUndefined()
    expect(writeMod['scheduleChunkEmbedding']).toBeUndefined()
    expect(writeMod['flushPendingMemoryWrites']).toBeUndefined()
    expect(writeMod['waitForEmbedHeadroom']).toBeUndefined()
  })

  it('batch queue respects FULCRUM_EMBED_CONCURRENCY (bounded parallelism)', async () => {
    // Run N > concurrency embed tasks; record peak in-flight. Must never
    // exceed EMBED_CONCURRENCY derived from process.env at import time (or
    // the 4 default). If the relocation accidentally split the module-level
    // queue into two instances, some tasks would run outside the cap.
    const cap = Math.max(1, Number(process.env['FULCRUM_EMBED_CONCURRENCY'] ?? 4) || 4)
    let inFlight = 0
    let peak = 0
    const tasks: Promise<void>[] = []
    for (let i = 0; i < cap * 3; i++) {
      tasks.push(
        l2Queue.enqueueEmbed(async () => {
          inFlight++
          peak = Math.max(peak, inFlight)
          await new Promise<void>((resolve) => setImmediate(resolve))
          inFlight--
        }),
      )
    }
    await Promise.all(tasks)
    expect(peak).toBeLessThanOrEqual(cap)
  })
})

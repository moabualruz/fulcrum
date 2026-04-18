// packages/memory/src/l2/queue.ts
//
// Bounded-concurrency embedding queue — the ONNX worker deadlocks when
// thousands of embed promises are fired in parallel, so every embed task
// funnels through this single queue. The cap is `EMBED_CONCURRENCY`
// (FULCRUM_EMBED_CONCURRENCY env, default 4) and is shared between vec_memories
// embeds and vec_chunks embeds — splitting the queue into two module-level
// copies would let each one run up to `cap` tasks and re-introduce the
// deadlock this file exists to prevent.
//
// Moved from packages/memory/src/write.ts during PR 4 unit 4.1 (memory v3
// "L2 reshape"). Behaviour and export names preserved; write.ts now re-exports
// from this module so existing callers keep compiling.

const EMBED_CONCURRENCY = Math.max(1, Number(process.env['FULCRUM_EMBED_CONCURRENCY'] ?? 4) || 4)

interface QueueItem {
  run: () => Promise<unknown>
  resolve: () => void
  reject: (err: unknown) => void
}

const embedQueue: QueueItem[] = []
let embedInFlight = 0
const embedIdleWaiters: Array<() => void> = []

let _embedPumpLogCount = 0
function pumpEmbedQueue(): void {
  while (embedInFlight < EMBED_CONCURRENCY && embedQueue.length > 0) {
    const item = embedQueue.shift()!
    embedInFlight++
    if (process.env['FULCRUM_DIAG_EMBED']) {
      _embedPumpLogCount++
      if (_embedPumpLogCount <= 20 || _embedPumpLogCount % 100 === 0) {
        process.stderr.write(`[diag-queue] start #${_embedPumpLogCount} inflight=${embedInFlight} queue=${embedQueue.length}\n`)
      }
    }
    item.run()
      .then(() => item.resolve(), (err) => item.reject(err))
      .finally(() => {
        embedInFlight--
        if (process.env['FULCRUM_DIAG_EMBED'] && (_embedPumpLogCount <= 20 || _embedPumpLogCount % 100 === 0)) {
          process.stderr.write(`[diag-queue] done inflight=${embedInFlight} queue=${embedQueue.length}\n`)
        }
        if (embedInFlight === 0 && embedQueue.length === 0) {
          const waiters = embedIdleWaiters.splice(0)
          for (const w of waiters) w()
        }
        pumpEmbedQueue()
      })
  }
}

/** Enqueue an embedding task; returns a promise that resolves when it runs. */
export function enqueueEmbed(task: () => Promise<unknown>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    embedQueue.push({ run: task, resolve, reject })
    pumpEmbedQueue()
  })
}

const EMBED_HIGH_WATER = Math.max(8, EMBED_CONCURRENCY * 4)
const EMBED_LOW_WATER = Math.max(2, EMBED_CONCURRENCY)

/**
 * Resolve once the in-flight + queued embed count is below the low-water
 * mark. Callers performing bulk ingest (initial scan, backfill) should await
 * this between batches so embeds drain alongside writes.
 */
export async function waitForEmbedHeadroom(): Promise<void> {
  if (embedQueue.length + embedInFlight <= EMBED_HIGH_WATER) return
  while (embedQueue.length + embedInFlight > EMBED_LOW_WATER) {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

// Non-embed async work (L2 extraction, Kuzu reducers) uses the promise-tracker
// pattern since those tasks are individually fast and independent.
const pendingAsyncWork = new Set<Promise<unknown>>()

export function trackAsyncWork<T>(p: Promise<T>): Promise<T> {
  pendingAsyncWork.add(p)
  p.finally(() => pendingAsyncWork.delete(p))
  return p
}

/**
 * Await every fire-and-forget embedding + extraction promise spawned by
 * writeMemory / scheduleChunkEmbedding. Intended for short-lived CLI entry
 * points about to call process.exit(). Returns once all pending work settles
 * or the timeout fires (default 30s for heavy backfill scenarios) — never
 * throws.
 */
export async function flushPendingMemoryWrites(timeoutMs = 30_000): Promise<void> {
  const queueDrained: Promise<void> = (embedQueue.length === 0 && embedInFlight === 0)
    ? Promise.resolve()
    : new Promise<void>((resolve) => embedIdleWaiters.push(resolve))
  const otherWork = pendingAsyncWork.size === 0
    ? Promise.resolve()
    : Promise.allSettled([...pendingAsyncWork]).then(() => undefined)
  const all = Promise.all([queueDrained, otherWork])
  const timeout = new Promise<'timeout'>((r) => {
    const t = setTimeout(() => r('timeout'), timeoutMs)
    t.unref?.()
  })
  const result = await Promise.race([all, timeout])
  if (result === 'timeout' && process.env['FULCRUM_VERBOSE']) {
    process.stderr.write(`[write] flushPendingMemoryWrites: queue=${embedQueue.length} inflight=${embedInFlight} pending=${pendingAsyncWork.size} after ${timeoutMs}ms\n`)
  }
}

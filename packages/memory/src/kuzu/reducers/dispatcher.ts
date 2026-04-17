// v2b PR 10 Task 1.6 — reducer dispatcher batching + backpressure.

import { type EmitEventInput } from '@moabualruz/fulcrum-core'
import { dispatchToGraphReducers } from './index.js'

export interface ReducerDispatcher {
  enqueue(event: EmitEventInput): void
  flush(): void
  stop(): void
}

interface DispatcherOptions {
  batchSize: number
  flushIntervalMs: number
  lagThresholdMs?: number
  maxBuffer?: number
}

export function createReducerDispatcher(opts: DispatcherOptions): ReducerDispatcher {
  const { batchSize, flushIntervalMs, lagThresholdMs, maxBuffer = 1024 } = opts
  const buffer: EmitEventInput[] = []

  const flush = (): void => {
    if (buffer.length === 0) return
    const batch = buffer.splice(0, buffer.length)
    for (const event of batch) {
      const start = Date.now()
      dispatchToGraphReducers(event)
      if (lagThresholdMs !== undefined) {
        const elapsed = Date.now() - start
        if (elapsed > lagThresholdMs) {
          console.warn(`[fulcrum] reducer_lag event=${event.evt_type} elapsed=${elapsed}ms threshold=${lagThresholdMs}ms`)
        }
      }
    }
  }

  const timer = setInterval(flush, flushIntervalMs)

  return {
    enqueue(event: EmitEventInput): void {
      if (buffer.length >= maxBuffer) {
        console.error(`[fulcrum] reducer_overflow maxBuffer=${maxBuffer} dropping oldest event`)
        buffer.shift()
      }
      buffer.push(event)
      if (buffer.length >= batchSize) flush()
    },
    flush,
    stop(): void {
      clearInterval(timer)
      flush()
    },
  }
}

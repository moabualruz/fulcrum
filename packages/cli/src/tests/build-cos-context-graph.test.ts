// PR 19 Task 10.5 — build_cos_context graph-query reframing + cache invalidation.
//
// Verifies that the CoS context builder: (a) uses 5-min cache, and
// (b) invalidates on task_updated / agent_run_started / handoff_dispatched events.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildCosContext, CoSContextCache, CACHE_TTL_MS, invalidateCosCache } from '../actions/build-cos-context.js'

afterEach(() => {
  vi.restoreAllMocks()
  invalidateCosCache()
})

describe('CoSContextCache', () => {
  it('CACHE_TTL_MS is 5 minutes', () => {
    expect(CACHE_TTL_MS).toBe(5 * 60 * 1000)
  })

  it('returns cached result within TTL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ tasks: [], runs: [] })
    const result1 = await buildCosContext({ workspace_id: 'ws_1' }, mockFetch)
    const result2 = await buildCosContext({ workspace_id: 'ws_1' }, mockFetch)
    expect(mockFetch).toHaveBeenCalledOnce() // second call uses cache
    expect(result1).toBe(result2)
  })

  it('invalidateCosCache clears the cache', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ tasks: [], runs: [] })
    await buildCosContext({ workspace_id: 'ws_1' }, mockFetch)
    invalidateCosCache('ws_1')
    await buildCosContext({ workspace_id: 'ws_1' }, mockFetch)
    expect(mockFetch).toHaveBeenCalledTimes(2) // cache was invalidated
  })
})

describe('Cache invalidation events', () => {
  it('task_updated invalidates cache for workspace', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ tasks: [], runs: [] })
    await buildCosContext({ workspace_id: 'ws_events' }, mockFetch)
    invalidateCosCache('ws_events', 'task_updated')
    await buildCosContext({ workspace_id: 'ws_events' }, mockFetch)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('agent_run_started invalidates cache for workspace', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ tasks: [], runs: [] })
    await buildCosContext({ workspace_id: 'ws_events2' }, mockFetch)
    invalidateCosCache('ws_events2', 'agent_run_started')
    await buildCosContext({ workspace_id: 'ws_events2' }, mockFetch)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('handoff_dispatched invalidates cache for workspace', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ tasks: [], runs: [] })
    await buildCosContext({ workspace_id: 'ws_events3' }, mockFetch)
    invalidateCosCache('ws_events3', 'handoff_dispatched')
    await buildCosContext({ workspace_id: 'ws_events3' }, mockFetch)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('unrelated event does NOT invalidate cache', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ tasks: [], runs: [] })
    await buildCosContext({ workspace_id: 'ws_unrelated' }, mockFetch)
    invalidateCosCache('ws_unrelated', 'some_other_event')
    await buildCosContext({ workspace_id: 'ws_unrelated' }, mockFetch)
    expect(mockFetch).toHaveBeenCalledOnce() // cache NOT invalidated
  })
})

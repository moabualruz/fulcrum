// PR 19 Task 10.5 — build_cos_context parameterized graph query with 5-min cache.
//
// Cache invalidated on: task_updated | agent_run_started | handoff_dispatched.
// Part 02 §"Chief-of-Staff context" lines 236-244.

export const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

const INVALIDATING_EVENTS = new Set([
  'task_updated',
  'agent_run_started',
  'handoff_dispatched',
])

export interface CosContextInput {
  workspace_id: string
  project_id?: string
  goal?: string
}

export type CoSFetcher = (input: CosContextInput) => Promise<Record<string, unknown>>

interface CacheEntry {
  value: Record<string, unknown>
  fetchedAt: number
}

export class CoSContextCache {
  private cache = new Map<string, CacheEntry>()

  get(workspaceId: string): Record<string, unknown> | null {
    const entry = this.cache.get(workspaceId)
    if (!entry) return null
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      this.cache.delete(workspaceId)
      return null
    }
    return entry.value
  }

  set(workspaceId: string, value: Record<string, unknown>): void {
    this.cache.set(workspaceId, { value, fetchedAt: Date.now() })
  }

  invalidate(workspaceId: string): void {
    this.cache.delete(workspaceId)
  }

  clear(): void {
    this.cache.clear()
  }
}

// Module-level cache singleton
const _cache = new CoSContextCache()

export async function buildCosContext(
  input: CosContextInput,
  fetcher: CoSFetcher
): Promise<Record<string, unknown>> {
  const cached = _cache.get(input.workspace_id)
  if (cached) return cached

  const result = await fetcher(input)
  _cache.set(input.workspace_id, result)
  return result
}

/**
 * Invalidates the CoS context cache for a workspace.
 * Pass an event name to validate it's a known invalidating event;
 * only INVALIDATING_EVENTS cause invalidation.
 */
export function invalidateCosCache(workspaceId?: string, event?: string): void {
  if (event !== undefined && !INVALIDATING_EVENTS.has(event)) {
    return // unrecognized event does not invalidate
  }
  if (workspaceId) {
    _cache.invalidate(workspaceId)
  } else {
    _cache.clear()
  }
}

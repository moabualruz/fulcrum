// packages/worker/src/adapter.ts
// Agent adapter registry. A flat, process-global Map keyed by adapter name.
// `lifecycle.ts` registers the built-in `stub` and `subprocess` adapters
// at module load; userland code can add more with `registerAgentAdapter`.

import type { AgentAdapter } from './types.js'

const _adapters = new Map<string, AgentAdapter>()

/**
 * Register (or replace) an adapter. Re-registering with the same name
 * overwrites the previous entry — useful for test stubs.
 */
export function registerAgentAdapter(adapter: AgentAdapter): void {
  _adapters.set(adapter.name, adapter)
}

/**
 * Look up an adapter by name. Returns `null` if no adapter is registered
 * under that name so callers can surface a clear error.
 */
export function getAgentAdapter(name: string): AgentAdapter | null {
  return _adapters.get(name) ?? null
}

/** Enumerate currently-registered adapter names. */
export function listAgentAdapters(): string[] {
  return Array.from(_adapters.keys())
}

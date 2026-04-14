// packages/core/src/constants.ts
// Named constants used across the Fulcrum control plane.
// Single source of truth — update here, ripple through callers.

/** Default heartbeat freshness window. Runs older than this are marked stale. */
export const DEFAULT_HEARTBEAT_TIMEOUT_SEC = 600 // 10 minutes

/** Default escalation window. Blocked runs older than this escalate to CoS. */
export const DEFAULT_ESCALATION_TIMEOUT_SEC = 1800 // 30 minutes

/** Default WIP limit per role for a workspace. */
export const DEFAULT_WIP_LIMIT = 3

/** Default HTTP port for the monitor + control API server. */
export const DEFAULT_MONITOR_PORT = 4721

/** Default text embedding dimension (Qwen3 / bge-m3 / all-MiniLM). */
export const DEFAULT_EMBED_DIM = 1024

/** Default advisory lock TTL in seconds. */
export const DEFAULT_LOCK_TTL_SEC = 900 // 15 minutes

/** Janitor cycle interval — how often stale/expired state is reaped. */
export const JANITOR_INTERVAL_SEC = 60

/** §10.7 hybrid memory ranking weights (must sum to 1.0). */
export const MEMORY_RANK_WEIGHTS = {
  semantic: 0.4,
  lexical: 0.3,
  recency: 0.2,
  confidence: 0.1,
} as const

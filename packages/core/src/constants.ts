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

/**
 * Memory decay: multiplicative factor applied per week to importance values
 * below MEMORY_DECAY_THRESHOLD. 0.9 = 10% per week.
 */
export const MEMORY_DECAY_FACTOR = 0.9
export const MEMORY_DECAY_THRESHOLD = 0.5
export const MEMORY_DECAY_MIN_DAYS_SINCE_ACCESS = 7
export const MEMORY_DECAY_FLOOR = 0.01

/**
 * Memory consolidation: two memories with cosine similarity above this
 * threshold are considered duplicates and merged by the janitor.
 * Slightly higher than the write-time threshold (0.9) to be conservative
 * about merging existing memories.
 */
export const MEMORY_CONSOLIDATION_THRESHOLD = 0.92

/**
 * Maximum number of embedding-bearing memories to compare per consolidation
 * cycle. Keeps the O(n²) comparison bounded for large workspaces.
 */
export const MEMORY_CONSOLIDATION_BATCH_SIZE = 200

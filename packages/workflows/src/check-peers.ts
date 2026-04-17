// packages/workflows/src/check-peers.ts
//
// Advisory peer-dependency check for fulcrum-workflows.
//
// The three peer deps (fulcrum-planning, fulcrum-teams, fulcrum-worker) are
// optional at install time but required at runtime for certain workflow step
// handlers. This module detects missing peers and warns on stderr so callers
// can fail fast with a useful message rather than a cryptic import error.
//
// Design decisions:
//  - Does NOT throw — it is advisory only. Callers read `missing` and decide.
//  - Uses createRequire (ESM-safe) for synchronous resolution without importing
//    the packages themselves.
//  - Result is cached at module level so repeated calls (e.g. runWorkflow
//    called in a tight loop) pay the resolution cost only once per process.

import { createRequire } from 'module'

const PEERS = ['fulcrum-planning', 'fulcrum-teams', 'fulcrum-worker'] as const
type PeerName = (typeof PEERS)[number]

export interface CheckWorkflowPeersResult {
  missing: string[]
}

let _cached: CheckWorkflowPeersResult | undefined

/**
 * Check that the optional peer dependencies of fulcrum-workflows are
 * resolvable in the current environment. Logs a warning to stderr for each
 * missing peer and returns the list of missing packages.
 *
 * Safe to call multiple times — result is cached after the first call.
 */
export function checkWorkflowPeers(): CheckWorkflowPeersResult {
  if (_cached) return _cached

  const require = createRequire(import.meta.url)
  const missing: string[] = []

  for (const peer of PEERS) {
    try {
      require.resolve(peer)
    } catch {
      missing.push(peer)
      process.stderr.write(
        `[fulcrum/workflows] WARNING: optional peer dependency "${peer}" is not installed.\n` +
          `  Some workflow step handlers will not be available until it is added.\n`,
      )
    }
  }

  _cached = { missing }
  return _cached
}

/** Reset the cache — intended for tests only. */
export function _resetCheckWorkflowPeersCache(): void {
  _cached = undefined
}

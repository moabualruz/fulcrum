// PCI lifecycle — now backed by the fulcrum-indexer daemon.
//
// Public API (signatures + semantics) is preserved for backwards compat with
// callers in packages/core (runs.ts) and packages/cli (index.ts). Under the
// hood, `ensure` / `stop` are replaced with fire-and-forget calls to the
// shared indexer client: start_agent_run fires ensureWatching once the
// project's root_realpath resolves; complete/block fires releaseWatching;
// the MCP server uses acquireServerHandle the same way.
//
// All daemon RPCs are fire-and-forget from the lifecycle layer — the caller
// (runs.ts) treats PCI as best-effort, and swallowing here preserves that
// contract when the daemon is unreachable. A CLI user who wants explicit
// awaitable semantics can use `indexerClient().ensureWatching(root)` directly.
//
// After PR 4 Commit B, pci/lock.ts and pci/singleton.ts are removed; this
// file is the only remaining PCI entry point.

import { realpathSync } from 'node:fs'
import type { Db } from 'fulcrum-agent-core'
import { getDb } from 'fulcrum-agent-core'
import { indexerClient, IndexerUnreachableError } from '../indexer/client.js'
import { VaultOwnedPathError } from './vault-guard.js'

/**
 * Compatibility shim — callers of the old singleton received a handle with
 * `projectRoot`, `realpath`, and a `stop()` method. We still return that
 * shape; `stop` now calls releaseWatching on the daemon.
 */
export interface PciHandle {
  projectRoot: string
  realpath: string
  stop: () => void
}

/** run_id → root (resolved). */
const runRoots = new Map<string, string>()

/** Optional top-level root — the MCP server acquires this during serve. */
let serverRoot: string | null = null

/**
 * Resolve a project's root directory from the `projects` table. Returns the
 * first non-empty of root_realpath > root_path; `null` if neither is set.
 */
export function resolveProjectRoot(projectId: string, db: Db = getDb()): string | null {
  const row = db.prepare('SELECT root_realpath, root_path FROM projects WHERE project_id = ?').get(projectId) as { root_realpath: string | null; root_path: string | null } | undefined
  if (!row) return null
  const candidate = row.root_realpath ?? row.root_path
  if (!candidate) return null
  try { return realpathSync(candidate) }
  catch { return candidate }
}

export interface OnAgentRunStartInput {
  run_id: string
  project_id: string | null
  db?: Db
}

/**
 * Fire ensureWatching on the daemon for this run's project. Fire-and-forget:
 * errors are logged (stderr, once) but never thrown to the caller, matching
 * the existing "PCI is best-effort" contract in runs.ts.
 *
 * Logical projects (no filesystem root), vault-owned paths, and
 * FULCRUM_DISABLE_PCI=1 are no-ops.
 */
export function onAgentRunStart(input: OnAgentRunStartInput): PciHandle | null {
  if (process.env['FULCRUM_DISABLE_PCI'] === '1') return null
  if (!input.project_id) return null
  const db = input.db ?? getDb()
  const root = resolveProjectRoot(input.project_id, db)
  if (!root) return null

  runRoots.set(input.run_id, root)
  void indexerClient().ensureWatching(root).catch(logDaemonError('onAgentRunStart'))
  return { projectRoot: root, realpath: root, stop: () => onAgentRunEnd(input.run_id) }
}

/**
 * Drop the refcount for the project attached to this run. 30-s grace is now
 * owned by the daemon (DaemonRegistry) rather than this process.
 */
export function onAgentRunEnd(run_id: string): void {
  const root = runRoots.get(run_id)
  if (!root) return
  runRoots.delete(run_id)
  void indexerClient().releaseWatching(root).catch(logDaemonError('onAgentRunEnd'))
}

/**
 * MCP-server acquire. Kept separate from the per-run handle so a serve-mcp
 * process can hold a watch across many agent runs without the grace-timer
 * racing against each run's release.
 */
export function acquireServerHandle(projectRoot: string | null): PciHandle | null {
  if (process.env['FULCRUM_DISABLE_PCI'] === '1') return null
  if (!projectRoot) return null
  if (serverRoot) return { projectRoot, realpath: serverRoot, stop: releaseServerHandle }

  serverRoot = projectRoot
  void indexerClient().ensureWatching(projectRoot).catch((err) => {
    serverRoot = null
    logDaemonError('acquireServerHandle')(err)
  })
  return { projectRoot, realpath: projectRoot, stop: releaseServerHandle }
}

export function releaseServerHandle(): void {
  const root = serverRoot
  if (!root) return
  serverRoot = null
  void indexerClient().releaseWatching(root).catch(logDaemonError('releaseServerHandle'))
}

/** Test-only — drop all tracked run/root mappings without calling the daemon. */
export function _resetLifecycleState(): void {
  runRoots.clear()
  serverRoot = null
}

/** Test-only — inspect the tracking map. */
export function _activeRunHandleCount(): number {
  return runRoots.size
}

// ── Error logging helpers ───────────────────────────────────────────────────
// Best-effort surface: IndexerUnreachableError and VaultOwnedPathError get
// muted (expected flows); anything else is logged once to stderr.

let _unreachableLogged = false
function logDaemonError(site: string): (err: unknown) => void {
  return (err: unknown) => {
    if (err instanceof VaultOwnedPathError) return
    if (err instanceof IndexerUnreachableError) {
      if (_unreachableLogged) return
      _unreachableLogged = true
      process.stderr.write(`[fulcrum/pci] indexer daemon unreachable; code-index will be stale (${site})\n`)
      return
    }
    const code = (err as { code?: string })?.code
    if (code === 'vault_owned_path') return
    process.stderr.write(`[fulcrum/pci] ${site}: ${(err as Error).message ?? String(err)}\n`)
  }
}

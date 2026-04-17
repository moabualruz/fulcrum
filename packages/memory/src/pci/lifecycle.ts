// v2a PR 4 Task 20 — PCI lifecycle integration.
//
// Bridges the core run lifecycle (start / complete / block / heartbeat-expire)
// into the PCI singleton's ensure() / stop() contract. Held out of runs.ts so
// the memory package owns all ensure/stop references — core imports memory
// lazily via the same string-module trick used by opportunisticSweep to avoid
// a dependency cycle.
//
// Registration is idempotent: two concurrent start_agent_run calls against the
// same project root produce ONE fs.FSWatcher (the singleton dedups), ONE init
// emission, and two refcount increments. Stopping a run that never registered
// is a no-op.

import { realpathSync } from 'node:fs'
import type { Db } from 'fulcrum-agent-core'
import { getDb } from 'fulcrum-agent-core'
import { ensure, VaultOwnedPathError, type PciHandle } from './singleton.js'

/** run_id → PciHandle. stop() is called from complete/block/expire. */
const handles = new Map<string, PciHandle>()

/** Optional top-level handle — the MCP server holds this while serving. */
let serverHandle: PciHandle | null = null

/**
 * Resolve a project's root directory from the `projects` table. Returns
 * the first non-empty of root_realpath > root_path; `null` if neither is
 * set, which means the project is logical and has no filesystem root.
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
 * Hook called from startAgentRun after the run row is inserted. No-op when
 * the project has no filesystem root (logical projects), or when PCI is
 * disabled via FULCRUM_DISABLE_PCI.
 */
export function onAgentRunStart(input: OnAgentRunStartInput): PciHandle | null {
  if (process.env['FULCRUM_DISABLE_PCI'] === '1') return null
  if (!input.project_id) return null
  const db = input.db ?? getDb()
  const root = resolveProjectRoot(input.project_id, db)
  if (!root) return null
  try {
    const handle = ensure(root)
    handles.set(input.run_id, handle)
    return handle
  } catch (err) {
    // Vault-owned paths are fine — the vault watcher already covers them.
    if (err instanceof VaultOwnedPathError) return null
    throw err
  }
}

/**
 * Hook called from complete/block/heartbeat-expire. Drops the refcount for
 * the project; the singleton holds the watcher open for a 30s grace period
 * so back-to-back runs don't thrash the FSWatcher.
 */
export function onAgentRunEnd(run_id: string): void {
  const handle = handles.get(run_id)
  if (!handle) return
  handles.delete(run_id)
  try { handle.stop() } catch { /* already stopped */ }
}

/**
 * Top-level MCP-server handle. Call once at `fulcrum serve mcp` startup with
 * the workspace root (if any). Keeps the watcher alive while the server is
 * running even when no agent runs are active — stops the 30s grace from
 * tearing down the watcher between runs.
 */
export function acquireServerHandle(projectRoot: string | null): PciHandle | null {
  if (process.env['FULCRUM_DISABLE_PCI'] === '1') return null
  if (!projectRoot) return null
  if (serverHandle) return serverHandle
  try {
    serverHandle = ensure(projectRoot)
    return serverHandle
  } catch (err) {
    if (err instanceof VaultOwnedPathError) return null
    return null
  }
}

export function releaseServerHandle(): void {
  if (!serverHandle) return
  try { serverHandle.stop() } catch { /* already */ }
  serverHandle = null
}

/** Test-only: drop all tracked handles without stopping them. */
export function _resetLifecycleState(): void {
  handles.clear()
  serverHandle = null
}

/** Test-only: inspect the tracking map. */
export function _activeRunHandleCount(): number {
  return handles.size
}

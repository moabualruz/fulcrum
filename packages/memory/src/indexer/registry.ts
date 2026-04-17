// Daemon-side project registry.
//
// One DaemonRegistry instance per running daemon process. Owns a Map<realpath,
// Entry> where each entry holds a PciSyncerHandle (chokidar subscription),
// its refcount, and a grace-timer used to keep the watcher alive across
// rapid client reconnects (e.g., a session ending and another starting in
// the same project within a few seconds).
//
// Cross-process coordination is NOT in this file — the daemon is the single
// process, so a plain in-memory Map is sufficient. The process boundary is
// protected by the socket bind (see daemon.ts).
//
// See docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md Unit 2.1.

import { realpathSync } from 'node:fs'
import { relative } from 'node:path'
import { startPciSyncer, type PciSyncerHandle } from '../pci/syncer.js'
import { isVaultOwnedPath, VaultOwnedPathError } from '../pci/singleton.js'
import { HandlerError } from './handlers.js'

const DEFAULT_GRACE_MS = 30_000

export interface RegistryOptions {
  /** Hook for tests to map a realpath to a workspace_id; production uses projectIdsFromPath. */
  workspaceIdFor: (realpath: string) => string
  /** Hook for tests to map a realpath to a project_id. */
  projectIdFor: (realpath: string) => string
  /** Grace period before teardown when refcount hits zero. */
  graceMs?: number
}

export interface EnsureResult {
  /** The actual directory now being watched (may be an ancestor of the requested root). */
  watch: string
  /** Path from `watch` to the originally-requested root ("" when equal). */
  relative_path: string
  /** True when this call did NOT start a new watcher. */
  already_watched: boolean
}

export interface ReleaseResult {
  watch: string
  refcount: number
}

export interface ProjectStatus {
  root: string
  refcount: number
  watcher_active: boolean
}

export interface DaemonRegistry {
  ensureWatching(root: string): EnsureResult
  releaseWatching(root: string): ReleaseResult
  getStatus(): { projects: ProjectStatus[] }
  getRefcount(root: string): number
  shutdownAll(): void
  activeWatches(): number
}

interface Entry {
  realpath: string
  refcount: number
  graceTimer: ReturnType<typeof setTimeout> | null
  syncer: PciSyncerHandle
}

export function createDaemonRegistry(opts: RegistryOptions): DaemonRegistry {
  const graceMs = opts.graceMs ?? DEFAULT_GRACE_MS
  const entries = new Map<string, Entry>()

  function resolveReal(root: string): string {
    try { return realpathSync(root) } catch { return root }
  }

  /** Find an existing entry that's an ancestor of `realpath`. */
  function findAncestor(realpath: string): Entry | null {
    for (const entry of entries.values()) {
      if (realpath === entry.realpath) return entry
      if (realpath.startsWith(entry.realpath + '/')) return entry
    }
    return null
  }

  function ensureWatching(root: string): EnsureResult {
    const realpath = resolveReal(root)
    if (isVaultOwnedPath(realpath)) throw new VaultOwnedPathError(realpath)

    const existing = findAncestor(realpath)
    if (existing) {
      existing.refcount += 1
      if (existing.graceTimer) {
        clearTimeout(existing.graceTimer)
        existing.graceTimer = null
      }
      return {
        watch: existing.realpath,
        relative_path: realpath === existing.realpath ? '' : relative(existing.realpath, realpath),
        already_watched: true,
      }
    }

    // Fresh mount.
    const syncer = startPciSyncer({
      workspaceId: opts.workspaceIdFor(realpath),
      projectId: opts.projectIdFor(realpath),
      projectRoot: realpath,
    })
    entries.set(realpath, {
      realpath,
      refcount: 1,
      graceTimer: null,
      syncer,
    })
    return { watch: realpath, relative_path: '', already_watched: false }
  }

  function releaseWatching(root: string): ReleaseResult {
    const realpath = resolveReal(root)
    const entry = findAncestor(realpath)
    if (!entry) {
      throw new HandlerError('not_watching', `no active watch covers ${realpath}`)
    }
    entry.refcount = Math.max(0, entry.refcount - 1)
    if (entry.refcount === 0 && !entry.graceTimer) {
      entry.graceTimer = setTimeout(() => teardown(entry.realpath), graceMs)
      // Don't keep the node event loop alive just for a grace timer — the
      // daemon's idle-timeout (PR 3) decides the overall liveness.
      entry.graceTimer.unref?.()
    }
    return { watch: entry.realpath, refcount: entry.refcount }
  }

  function teardown(realpath: string): void {
    const entry = entries.get(realpath)
    if (!entry) return
    if (entry.refcount > 0) return // someone re-ensured during grace
    try { entry.syncer.stop() } catch { /* already stopped */ }
    if (entry.graceTimer) clearTimeout(entry.graceTimer)
    entries.delete(realpath)
  }

  function shutdownAll(): void {
    for (const entry of entries.values()) {
      if (entry.graceTimer) clearTimeout(entry.graceTimer)
      try { entry.syncer.stop() } catch { /* already stopped */ }
    }
    entries.clear()
  }

  function getStatus(): { projects: ProjectStatus[] } {
    const projects: ProjectStatus[] = []
    for (const entry of entries.values()) {
      projects.push({
        root: entry.realpath,
        refcount: entry.refcount,
        watcher_active: entry.graceTimer === null,
      })
    }
    return { projects }
  }

  function getRefcount(root: string): number {
    const entry = entries.get(resolveReal(root))
    return entry ? entry.refcount : 0
  }

  function activeWatches(): number {
    return entries.size
  }

  return {
    ensureWatching,
    releaseWatching,
    getStatus,
    getRefcount,
    shutdownAll,
    activeWatches,
  }
}

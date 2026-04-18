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
import { join, relative } from 'node:path'
import { startPciSyncer, syncFile, type PciSyncerHandle } from '../pci/syncer.js'
import { startProjectWatch, type ProjectWatchHandle } from '../pci/watcher.js'
import { enumerateProjectFiles } from '../pci/walker-integration.js'
import { isVaultOwnedPath, VaultOwnedPathError } from '../pci/vault-guard.js'
import { waitForEmbedHeadroom } from '../write.js'
import { HandlerError } from './errors.js'

const DEFAULT_GRACE_MS = 30_000

export interface RegistryOptions {
  /** Hook for tests to map a realpath to a workspace_id; production uses projectIdsFromPath. */
  workspaceIdFor: (realpath: string) => string
  /** Hook for tests to map a realpath to a project_id. */
  projectIdFor: (realpath: string) => string
  /**
   * Hook called on every fresh mount. Production wires this to ensure the
   * workspaces/projects FK-parent rows exist before any writer dereferences
   * them. Tests may leave this unset — the stub syncer never writes rows.
   */
  ensureRows?: (realpath: string, workspaceId: string, projectId: string) => void
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
  workspace_id: string
  project_id: string
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
  workspaceId: string
  projectId: string
  refcount: number
  graceTimer: ReturnType<typeof setTimeout> | null
  syncer: PciSyncerHandle
  watch: ProjectWatchHandle
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

    // Fresh mount. Order matters:
    //   0. Ensure the workspace+project rows exist BEFORE any writer sees the
    //      computed IDs — code_chunks.project_id is a FK and the initial scan
    //      otherwise fails with "FOREIGN KEY constraint failed" for every
    //      file when the caller watches a path whose project row hasn't been
    //      created by `fulcrum`/MCP startup yet (daemon is long-lived and
    //      processes paths across many projects).
    //   1. Start the bus SUBSCRIBER (syncer) so events emitted during the
    //      initial scan are picked up.
    //   2. Start the PRODUCER (project watch) — this mounts fs.watch on every
    //      subdir and begins emitting to the bus.
    //   3. Kick off the initial scan so the DB is populated even for files
    //      that existed before the watcher mounted.
    const workspaceId = opts.workspaceIdFor(realpath)
    const projectId = opts.projectIdFor(realpath)
    opts.ensureRows?.(realpath, workspaceId, projectId)
    const syncer = startPciSyncer({
      workspaceId,
      projectId,
      projectRoot: realpath,
    })
    const watch = startProjectWatch(realpath)
    // Fire-and-forget initial scan — the watch is already live, so any edits
    // during the scan will flow through the bus; syncFile is content-hash
    // idempotent so double-processing is harmless.
    void performInitialScan(workspaceId, projectId, realpath)

    entries.set(realpath, {
      realpath,
      workspaceId,
      projectId,
      refcount: 1,
      graceTimer: null,
      syncer,
      watch,
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
    try { entry.watch.close() } catch { /* already closed */ }
    if (entry.graceTimer) clearTimeout(entry.graceTimer)
    entries.delete(realpath)
  }

  function shutdownAll(): void {
    for (const entry of entries.values()) {
      if (entry.graceTimer) clearTimeout(entry.graceTimer)
      try { entry.syncer.stop() } catch { /* already stopped */ }
      try { entry.watch.close() } catch { /* already closed */ }
    }
    entries.clear()
  }

  function getStatus(): { projects: ProjectStatus[] } {
    const projects: ProjectStatus[] = []
    for (const entry of entries.values()) {
      projects.push({
        root: entry.realpath,
        workspace_id: entry.workspaceId,
        project_id: entry.projectId,
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

/**
 * Walk the project tree and run each file through syncFile({change_type:'add'}).
 * This populates code_files / code_chunks for files that existed before the
 * watcher mounted. Idempotent — syncFile is sha256-keyed and skips unchanged
 * files. Errors on individual files are logged and don't abort the scan.
 */
async function performInitialScan(
  workspaceId: string,
  projectId: string,
  rootDir: string,
): Promise<void> {
  try {
    const result = await enumerateProjectFiles(rootDir)
    for (let i = 0; i < result.files.length; i++) {
      const rel = result.files[i]!
      try {
        await syncFile({
          workspaceId,
          projectId,
          projectRoot: rootDir,
          event: { change_type: 'add', path: join(rootDir, rel) },
        })
      } catch (err) {
        process.stderr.write(`[initial-scan] ${rel}: ${err instanceof Error ? err.message : String(err)}\n`)
      }
      // Apply backpressure against the embedding queue after every file. The
      // scan is much faster than the embedder — without this, thousands of
      // embeds queue up, memory pressure mounts, and ONNX deadlocks. The yield
      // inside waitForEmbedHeadroom also ensures libuv worker callbacks get a
      // chance to drain (the scan's microtask work otherwise starves them).
      await waitForEmbedHeadroom()
    }
    if (process.env['FULCRUM_VERBOSE']) {
      process.stderr.write(`[initial-scan] ${rootDir}: indexed ${result.files.length} files (mode=${result.mode}, skipped=${result.skipped})\n`)
    }
  } catch (err) {
    process.stderr.write(`[initial-scan] ${rootDir} failed: ${err instanceof Error ? err.message : String(err)}\n`)
  }
}

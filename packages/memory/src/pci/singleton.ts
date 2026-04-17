// v2a PR 4 Task 18 — ProjectContentIndexManager (PCI singleton).
//
// Process-wide singleton with refcount per project realpath. Cross-process
// lock at {globalDataDir()}/project-index-<sha256(realpath)>.lock. Second
// process opening the same project reads the central SQLite but does NOT
// spawn a watcher — only the lock holder runs the watcher.
//
// PR 4 Task 20 hooks ensure() into start_agent_run and Handle.stop() into
// complete/block_agent_run. PR 5 wires the WAL on top.

import { realpathSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { globalDataDir } from 'fulcrum-agent-core'
import { acquireLock, type LockHandle, LockError } from './lock.js'
import { watchDirectory, closeWatcherSubtree, activeWatcherCount } from './watcher.js'
import { isVaultOwnedPath, VaultOwnedPathError } from './vault-guard.js'

/**
 * v2a PR 4 Task 22 — vault/PCI dedup. The vault watcher already owns
 * {globalDataDir()}/memory/ via chokidar. The PCI watcher refuses to
 * attach to any directory at or under that prefix so both watchers
 * don't produce duplicate events for the same file.
 */
// v2a/PR4 of the indexer-daemon plan extracted the vault guard into
// packages/memory/src/pci/vault-guard.ts so the daemon registry and the
// lifecycle wrappers share a single class. Re-exported here during the
// commit-A window so callers that still import from singleton.js keep
// working. Commit B removes this file entirely.
export { isVaultOwnedPath, VaultOwnedPathError } from './vault-guard.js'

export interface PciHandle {
  projectRoot: string
  realpath: string
  /** Decrement refcount. When refcount → 0, watcher tears down after a 30s grace. */
  stop: () => void
}

interface PciEntry {
  realpath: string
  refcount: number
  lock: LockHandle | null
  graceTimer: NodeJS.Timeout | null
}

const GRACE_MS = 30_000
const entries = new Map<string, PciEntry>()

function lockPathFor(realpath: string): string {
  const hash = createHash('sha256').update(realpath).digest('hex')
  const dir = join(globalDataDir(), 'pci')
  mkdirSync(dir, { recursive: true })
  return join(dir, `project-index-${hash}.lock`)
}

/**
 * Increment the PCI refcount for `projectRoot`. The first ensure() acquires
 * the cross-process lock and starts the watcher; subsequent ensures share
 * the same handle.
 *
 * Throws LockError if another process already holds the lock for this
 * project — the caller (typically start_agent_run) should treat that as
 * "watcher running elsewhere; just use the central SQLite."
 */
export function ensure(projectRoot: string, opts: { force?: boolean } = {}): PciHandle {
  const realpath = (() => { try { return realpathSync(projectRoot) } catch { return projectRoot } })()
  // v2a PR 4 Task 22: vault owns {globalDataDir()}/memory — PCI refuses the path
  // to avoid double-emitting change events for vault-stored memory files.
  if (isVaultOwnedPath(realpath)) throw new VaultOwnedPathError(realpath)
  const existing = entries.get(realpath)
  if (existing) {
    existing.refcount++
    if (existing.graceTimer) {
      clearTimeout(existing.graceTimer)
      existing.graceTimer = null
    }
    return makeHandle(realpath, projectRoot)
  }

  // First ensure for this project — try to acquire the lock + start watcher.
  let lock: LockHandle | null = null
  if (!opts.force) {
    try {
      lock = acquireLock(lockPathFor(realpath))
    } catch (err) {
      if (err instanceof LockError) {
        // Another process holds the lock — register a no-watcher entry so this
        // process tracks refcount but doesn't duplicate the watcher.
        const entry: PciEntry = { realpath, refcount: 1, lock: null, graceTimer: null }
        entries.set(realpath, entry)
        return makeHandle(realpath, projectRoot)
      }
      throw err
    }
  }

  const entry: PciEntry = { realpath, refcount: 1, lock, graceTimer: null }
  entries.set(realpath, entry)
  // Start the root watcher. Subdirectory watchers are spawned by the walker
  // (PR 4 Task 21) as it discovers non-ignored dirs.
  try {
    watchDirectory(realpath)
  } catch {
    // If the root path can't be watched (missing, EPERM), still keep the
    // entry so downstream calls don't redundantly attempt the lock.
  }

  return makeHandle(realpath, projectRoot)
}

function makeHandle(realpath: string, projectRoot: string): PciHandle {
  return {
    projectRoot,
    realpath,
    stop: () => {
      const entry = entries.get(realpath)
      if (!entry) return
      entry.refcount = Math.max(0, entry.refcount - 1)
      if (entry.refcount === 0) {
        // Schedule tear-down after 30s grace so churn (e.g., a session ending
        // and another starting in the same project) doesn't reinitialize.
        entry.graceTimer = setTimeout(() => teardown(realpath), GRACE_MS)
      }
    },
  }
}

function teardown(realpath: string): void {
  const entry = entries.get(realpath)
  if (!entry || entry.refcount > 0) return
  closeWatcherSubtree(realpath)
  if (entry.lock) {
    try { entry.lock.release() } catch { /* already released */ }
  }
  entries.delete(realpath)
}

/**
 * Force-tear-down all PCI entries. Tests + the MCP server's shutdown hook
 * call this. Cancels grace timers, releases locks, closes watchers.
 */
export function shutdownAll(): void {
  for (const [realpath, entry] of entries.entries()) {
    if (entry.graceTimer) clearTimeout(entry.graceTimer)
    closeWatcherSubtree(realpath)
    if (entry.lock) {
      try { entry.lock.release() } catch { /* already released */ }
    }
  }
  entries.clear()
}

/** Telemetry — called by the monitor /content-index endpoint. */
export function pciStatus(): { entries: number; activeWatchers: number; refcounts: Record<string, number> } {
  const refcounts: Record<string, number> = {}
  for (const [realpath, entry] of entries.entries()) refcounts[realpath] = entry.refcount
  return {
    entries: entries.size,
    activeWatchers: activeWatcherCount(),
    refcounts,
  }
}

/**
 * True when the watcher for this project root was started in THIS process
 * (i.e., we own the lock). False when we attached to an existing watcher
 * held by another process, or the project isn't tracked here at all.
 */
export function isWatcherOwnedHere(projectRoot: string): boolean {
  const realpath = (() => { try { return realpathSync(projectRoot) } catch { return projectRoot } })()
  const entry = entries.get(realpath)
  return !!entry && !!entry.lock
}

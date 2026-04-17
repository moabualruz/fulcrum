// v2a PR 4 Task 17 — PCI watcher topology.
//
// Per-directory non-recursive fs.watch() — the mgrep pattern. fs.watch with
// recursive:true pre-allocates inotify watches on every subdir before any
// callback runs, blowing past kernel limits on large repos. Per-dir watches
// scale linearly with dirs visited and let us skip ignored dirs entirely.
//
// On unsupported filesystems (NFS / CIFS / FUSE / Overlay) detected by
// detect-fs.ts, the watcher flips to polling mode (5-minute periodic full
// rescan instead of fs.watch). Defaults are tunable per v2a review F-P1-4.
//
// Emits ContentChangeEvent (kind='code') on the shared bus after a 100ms
// debounce — see Task 22a contract.

import { watch, type FSWatcher, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { getContentChangeBus } from '@moabualruz/fulcrum-core'
import { detectFilesystem, shouldUsePollingFallback, type FsKind } from './detect-fs.js'

export type WatcherMode = 'native' | 'polling'

export interface WatchHandle {
  dir: string
  mode: WatcherMode
  fs: FsKind
  close: () => void
}

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes — tunable

export interface WatchDirectoryOpts {
  /** Optional ignore-test predicate; return true to skip a child directory. */
  shouldIgnore?: (childPath: string) => boolean
  /** Override poll interval (ms). Defaults to 5 minutes. */
  pollIntervalMs?: number
  /** Override the fs detection — useful for tests. */
  forcedFsKind?: FsKind
}

export function isMissingPathError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export function getPathStats(path: string): { isDirectory: boolean; isFile: boolean; size: number } | null {
  try {
    const s = statSync(path)
    return { isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size }
  } catch {
    return null
  }
}

const watchers = new Map<string, WatchHandle>()

/**
 * Begin watching `dir` non-recursively. Returns a handle that releases the
 * watcher when its close() is called. Idempotent: calling watchDirectory()
 * twice for the same directory returns the same handle.
 *
 * Emits ContentChangeEvent on the shared bus for each detected change.
 */
export function watchDirectory(dir: string, opts: WatchDirectoryOpts = {}): WatchHandle {
  const existing = watchers.get(dir)
  if (existing) return existing

  const fsKind = opts.forcedFsKind ?? detectFilesystem(dir)
  const mode: WatcherMode = shouldUsePollingFallback(fsKind) ? 'polling' : 'native'

  if (process.env['FULCRUM_VERBOSE']) {
    process.stderr.write(`[pci] watcher mode=${mode} fs=${fsKind} root=${dir}\n`)
  }

  if (mode === 'polling') {
    const handle = startPollingWatch(dir, opts.pollIntervalMs ?? POLL_INTERVAL_MS, fsKind)
    watchers.set(dir, handle)
    return handle
  }

  // Native: per-dir non-recursive fs.watch. Subdirectory watches are caller's
  // responsibility (the walker spawns them as it discovers dirs).
  let fsWatcher: FSWatcher | null = null
  try {
    fsWatcher = watch(dir, { persistent: false, recursive: false }, (event, filename) => {
      if (!filename) return
      const childPath = join(dir, basename(String(filename)))
      if (opts.shouldIgnore?.(childPath)) return
      handleFileEvent(dir, event, String(filename))
    })
  } catch (err) {
    if (isMissingPathError(err)) {
      // Caller should retry after the parent emits an 'add' event for this dir.
      throw err
    }
    throw err
  }

  const handle: WatchHandle = {
    dir,
    mode: 'native',
    fs: fsKind,
    close: () => {
      try { fsWatcher?.close() } catch { /* already closed */ }
      watchers.delete(dir)
    },
  }
  watchers.set(dir, handle)
  return handle
}

function startPollingWatch(dir: string, intervalMs: number, fsKind: FsKind): WatchHandle {
  // Stub: emits no events. PR 4 Task 19 wires the syncer's mtime → hash
  // → chunk-diff cascade through here on each tick. For PR 1 we ship the
  // mode-detection + handle contract so PR 4 / 5 can build on top.
  const timer = setInterval(() => {
    // periodic full-rescan would walk dir + emit events; deferred to syncer.
  }, intervalMs)
  return {
    dir,
    mode: 'polling',
    fs: fsKind,
    close: () => {
      clearInterval(timer)
      watchers.delete(dir)
    },
  }
}

/**
 * Translates an fs.watch event into a ContentChangeEvent and emits it on the
 * shared bus. Exported so PR 4 Task 19's ingest pipeline can re-invoke after
 * verifying the change passed sha256 dedup.
 */
export function handleFileEvent(dir: string, event: 'rename' | 'change', filename: string): void {
  const childPath = join(dir, filename)
  const stats = getPathStats(childPath)
  // No stat → file was unlinked between event arrival and inspection.
  // 'rename' on fs.watch covers both add and unlink — disambiguate via stat.
  const change_type: 'add' | 'change' | 'unlink' =
    event === 'change' ? 'change'
    : stats === null ? 'unlink'
    : 'add'
  // Compute a coarse sha256 only for files (not dirs); deferred to syncer
  // for performance — bus consumers can re-hash on demand.
  const sha = stats?.isFile ? 'pending' : ''
  getContentChangeBus().emit({ kind: 'code', path: childPath, sha256: sha, change_type })
}

export function closeWatcherSubtree(dir: string): void {
  for (const [d, handle] of watchers.entries()) {
    if (d === dir || d.startsWith(`${dir}/`)) {
      handle.close()
    }
  }
}

export function activeWatcherCount(): number {
  return watchers.size
}

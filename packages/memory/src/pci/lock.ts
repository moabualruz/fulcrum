// License: MIT (Fulcrum)
//
// v2a PR 1 Task 7 — cross-process advisory file lock for the PCI singleton.
// PR 4's watcher wraps its critical section (refcount mutation, ingest
// handoff) in withLock(). Two processes that race to acquire the same lock
// see one succeed and the other surface FulcrumError('locked').
//
// Implementation: O_EXCL | O_CREAT on the lock file — atomic at the
// filesystem layer on POSIX and Windows. Stale locks (older than ttlMs) are
// reclaimed on a best-effort basis; the holder's PID is recorded so a manual
// `fulcrum memory unlock` can verify before clearing.

import { existsSync, openSync, closeSync, unlinkSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

export class LockError extends Error {
  constructor(message: string, public readonly holderPid?: number) {
    super(message)
    this.name = 'LockError'
  }
}

export type LockHandle = {
  lockPath: string
  release: () => void
}

const DEFAULT_TTL_MS = 60_000 // one-minute stale threshold

/**
 * Acquire `lockPath` exclusively. Throws LockError if the lock is held by a
 * live holder. Stale locks (mtime older than ttlMs) are reclaimed. Caller MUST
 * call release() in a finally block.
 */
export function acquireLock(lockPath: string, opts: { ttlMs?: number; pid?: number } = {}): LockHandle {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
  const pid = opts.pid ?? process.pid

  mkdirSync(dirname(lockPath), { recursive: true })

  if (existsSync(lockPath)) {
    let stale = false
    let holderPid: number | undefined
    try { holderPid = Number(readFileSync(lockPath, 'utf8').trim()) } catch { /* unreadable */ }
    try {
      const stat = statSync(lockPath)
      if (Date.now() - stat.mtimeMs > ttlMs) stale = true
    } catch {
      stale = true
    }

    // Liveness check: a dead holderPid makes the lock stale regardless of TTL.
    // Without this, a crashed `fulcrum serve mcp` blocks the next boot for
    // up to one minute.
    if (!stale && holderPid && Number.isFinite(holderPid) && holderPid > 0) {
      try {
        process.kill(holderPid, 0) // signal 0 = liveness probe, does not actually signal
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ESRCH') stale = true
        // EPERM → alive but not ours to signal; still held.
      }
    }

    if (stale) {
      try { unlinkSync(lockPath) } catch { /* race with another reclaimer */ }
    } else {
      throw new LockError(`lock held: ${lockPath}`, holderPid)
    }
  }

  let fd: number
  try {
    fd = openSync(lockPath, 'wx') // O_EXCL | O_CREAT
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
      throw new LockError(`lock raced: ${lockPath}`)
    }
    throw err
  }
  try {
    writeFileSync(lockPath, String(pid), { flag: 'w' })
  } catch {
    closeSync(fd)
    try { unlinkSync(lockPath) } catch { /* ignore */ }
    throw new LockError(`lock write failed: ${lockPath}`)
  }
  closeSync(fd)

  return {
    lockPath,
    release: () => {
      try { unlinkSync(lockPath) } catch { /* already gone */ }
    },
  }
}

/** Convenience: run `fn` inside a lock and release it (even on error). */
export async function withLock<T>(lockPath: string, fn: () => Promise<T> | T, opts?: { ttlMs?: number }): Promise<T> {
  const handle = acquireLock(lockPath, opts)
  try {
    return await fn()
  } finally {
    handle.release()
  }
}

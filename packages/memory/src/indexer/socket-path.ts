// Platform-branched socket path for the fulcrum-indexer daemon.
// See docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md Unit 1.2.

import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { globalDataDir } from 'fulcrum-agent-core'

const SOCKET_BASENAME = 'fulcrum-indexer.sock'
const PIPE_PREFIX = '\\\\.\\pipe\\fulcrum-indexer-'

/**
 * Resolve the platform-appropriate IPC path for the indexer daemon.
 *
 * POSIX — `<globalDataDir>/fulcrum-indexer.sock`. The parent directory is
 *   created if it does not already exist; socket permissions are 0600 by
 *   virtue of being inside the user-owned `globalDataDir`.
 *
 * Windows — `\\.\pipe\fulcrum-indexer-<sanitized-username>`. Pipe names are
 *   user-scoped by default (ACL), and invalid characters in the username are
 *   collapsed so the resulting name is syntactically legal.
 */
export function indexerSocketPath(): string {
  if (process.platform === 'win32') {
    const raw = userInfo().username || 'user'
    const safe = sanitizePipeSegment(raw)
    return PIPE_PREFIX + safe
  }
  const dir = globalDataDir()
  mkdirSync(dir, { recursive: true })
  return join(dir, SOCKET_BASENAME)
}

function sanitizePipeSegment(s: string): string {
  const cleaned = s.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  if (cleaned.length === 0) return 'user'
  return cleaned.length > 64 ? cleaned.slice(0, 64) : cleaned
}

/**
 * Remove a stale socket file on POSIX when we're about to bind and there's a
 * leftover inode from a crashed prior daemon. On Windows, named pipes
 * disappear automatically when the owning process dies, so this is a no-op.
 */
export function unlinkStaleSocket(path: string): void {
  if (process.platform === 'win32') return
  if (!existsSync(path)) return
  try {
    unlinkSync(path)
  } catch {
    // ENOENT or EBUSY from a concurrent reclaimer — either way, not ours.
  }
  try { mkdirSync(dirname(path), { recursive: true }) } catch { /* already exists */ }
}

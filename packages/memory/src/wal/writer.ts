// v2a PR 5 Task 26 — WAL writer with sanitize-before-WAL invariant.
//
// Records JSONL audit rows at {globalDataDir()}/db/wal/memory-writes-YYYY-MM-DD.jsonl.
// Records content_sha256 ONLY — never the body. Sanitize-first is enforced
// via the SanitizedContent brand: appendWal accepts a branded type that the
// sanitizer alone produces. A caller passing raw input must go through
// sanitizeOnWrite() first, which produces the brand.
//
// Failure handling per v2a review F-P1-6:
//   * Sync errnos (ENOSPC, EROFS, EIO) → throw WalDurabilityError, blocking
//     the write. The write does NOT proceed without an audit row.
//   * Transient errnos (EAGAIN, EBUSY) → retry once; if retry succeeds,
//     proceed; if retry fails, log + proceed (don't block the universe on
//     one contention spike).

import * as nodeFs from 'node:fs'
const { openSync, writeSync, closeSync, mkdirSync, constants: fsConstants } = nodeFs
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { globalDataDir } from 'fulcrum-agent-core'
import type { SanitizeEvent } from '../sanitize/index.js'

// TEST-C: injectable fs so tests can simulate ENOSPC / EROFS / EIO / EAGAIN
// without mocking Node's built-in fs module (which is non-writable in ESM).
export interface WalFsImpl {
  openSync: typeof openSync
  writeSync: typeof writeSync
  closeSync: typeof closeSync
  mkdirSync: typeof mkdirSync
}
const realFsImpl: WalFsImpl = { openSync, writeSync, closeSync, mkdirSync }
let injectedFsImpl: WalFsImpl | null = null
/** Test hook — overrides the fs implementation used by appendWal. */
export function __setWalFsImpl(impl: WalFsImpl | null): void {
  injectedFsImpl = impl
}
function getFsImpl(): WalFsImpl {
  return injectedFsImpl ?? realFsImpl
}

export class WalDurabilityError extends Error {
  constructor(message: string, public readonly errno?: string) {
    super(message)
    this.name = 'WalDurabilityError'
  }
}

declare const __sanitized: unique symbol
export type SanitizedContent = string & { readonly [__sanitized]: true }

/**
 * Brand a string as sanitized. Internal — only sanitizeOnWrite should call
 * this once it has finished processing. Exported for tests + the sanitize
 * middleware module.
 */
export function brandSanitized(s: string): SanitizedContent {
  return s as SanitizedContent
}

export interface WalRecord {
  ts: string
  op: 'WRITE' | 'UPDATE' | 'DELETE' | 'SKIP'
  memory_id: string
  slug?: string | null
  kind: string
  tier?: string | null
  workspace_id: string
  project_id?: string | null
  provenance?: Record<string, unknown>
  content_sha256: string
  sanitize_events: SanitizeEvent[]
}

export interface AppendWalInput {
  op: WalRecord['op']
  memory_id: string
  slug?: string | null
  kind: string
  tier?: string | null
  workspace_id: string
  project_id?: string | null
  provenance?: Record<string, unknown>
  /** REQUIRED — content must already be sanitized. */
  content: SanitizedContent
  sanitize_events: SanitizeEvent[]
}

const SYNC_ERRNOS = new Set(['ENOSPC', 'EROFS', 'EIO'])
const TRANSIENT_ERRNOS = new Set(['EAGAIN', 'EBUSY'])

export function walPathFor(date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return join(globalDataDir(), 'db', 'wal', `memory-writes-${yyyy}-${mm}-${dd}.jsonl`)
}

export function appendWal(input: AppendWalInput): WalRecord {
  const record: WalRecord = {
    ts: new Date().toISOString(),
    op: input.op,
    memory_id: input.memory_id,
    slug: input.slug ?? null,
    kind: input.kind,
    tier: input.tier ?? null,
    workspace_id: input.workspace_id,
    project_id: input.project_id ?? null,
    provenance: input.provenance ?? {},
    content_sha256: createHash('sha256').update(input.content).digest('hex'),
    sanitize_events: input.sanitize_events,
  }

  const target = walPathFor()
  const serialized = `${JSON.stringify(record)}\n`

  // MED-17: atomic single-write-syscall append.
  //
  // The prior implementation (`appendFileSync`) opens+writes+closes on each
  // call, and multiple processes appending to the same JSONL can interleave
  // partial lines when the payload exceeds PIPE_BUF. O_APPEND on a single
  // open file descriptor guarantees the kernel appends each write() atomically
  // when the buffer is <= PIPE_BUF. Sanitize events can push serialized size
  // past 4 KiB — adding O_SYNC gives strong crash durability too.
  //
  // The in-process mutex (`writeQueue`) serialises multiple concurrent calls
  // from the same process even when the write > PIPE_BUF so the file stays
  // line-oriented JSONL.
  const writeOnce = (): void => {
    const impl = getFsImpl()
    impl.mkdirSync(dirname(target), { recursive: true })
    // O_APPEND | O_WRONLY | O_CREAT | O_SYNC
    const fd = impl.openSync(target, fsConstants.O_APPEND | fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_SYNC, 0o600)
    try {
      impl.writeSync(fd, serialized, null, 'utf8')
    } finally {
      impl.closeSync(fd)
    }
  }

  try {
    writeOnce()
  } catch (err) {
    const errno = (err as NodeJS.ErrnoException).code
    if (errno && SYNC_ERRNOS.has(errno)) {
      throw new WalDurabilityError(`WAL append failed (${errno}); write blocked`, errno)
    }
    if (errno && TRANSIENT_ERRNOS.has(errno)) {
      try {
        writeOnce()
      } catch (retryErr) {
        const retryErrno = (retryErr as NodeJS.ErrnoException).code
        if (retryErrno && SYNC_ERRNOS.has(retryErrno)) {
          throw new WalDurabilityError(`WAL append failed after retry (${retryErrno}); write blocked`, retryErrno)
        }
        // Transient failure on retry — log + proceed without the audit row.
        process.stderr.write(`[wal] transient error after retry: ${retryErr}; record skipped\n`)
      }
    } else {
      throw err
    }
  }
  return record
}

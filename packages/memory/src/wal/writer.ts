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

import { appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { globalDataDir } from 'fulcrum-core'
import type { SanitizeEvent } from '../sanitize/index.js'

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
  op: 'WRITE' | 'UPDATE' | 'DELETE'
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

  const writeOnce = (): void => {
    mkdirSync(dirname(target), { recursive: true })
    appendFileSync(target, serialized, 'utf8')
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

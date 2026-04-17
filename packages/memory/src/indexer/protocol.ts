// NDJSON wire-protocol codec for the fulcrum-indexer daemon.
//
// Protocol: each message is a single JSON object followed by '\n'. Clients and
// the daemon use this to frame request/response/event messages over a socket
// (POSIX unix socket or Windows named pipe).
//
// Designed to be parsed by `nc -U <sock>` + a one-liner, so debugging stays
// trivial and we avoid pulling in a binary framer like BSER or protobuf.
//
// See docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md (Unit 1.1).

const MAX_MESSAGE_BYTES = 16 * 1024 * 1024 // 16 MB soft cap per line

/**
 * Error codes surfaced back to clients via the `error.code` field of an
 * {@link IndexerErrorResponse}. Keep in sync with the table in the plan's
 * "High-Level Technical Design" section.
 */
export type IndexerErrorCode =
  | 'unknown_method'
  | 'invalid_params'
  | 'vault_owned_path'
  | 'not_watching'
  | 'busy'
  | 'internal'

export interface IndexerRequest {
  id: number
  method: string
  params?: Record<string, unknown>
}

export interface IndexerSuccessResponse {
  id: number
  result: unknown
}

export interface IndexerErrorResponse {
  id: number
  error: {
    code: IndexerErrorCode
    message: string
    /** Optional extra diagnostic payload (path, stack fragment, ...). */
    detail?: unknown
  }
}

export type IndexerResponse = IndexerSuccessResponse | IndexerErrorResponse

/** Unsolicited event pushed from daemon to client (watch notifications, etc). */
export interface IndexerEvent {
  event: string
  [k: string]: unknown
}

export type IndexerMessage = IndexerRequest | IndexerResponse | IndexerEvent

export class DecoderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DecoderError'
  }
}

export class MessageTooLargeError extends Error {
  constructor(bufferedBytes: number) {
    super(`indexer message exceeded ${MAX_MESSAGE_BYTES}-byte cap (buffered ${bufferedBytes})`)
    this.name = 'MessageTooLargeError'
  }
}

/** Encode a single message, producing the bytes to send on the wire. */
export function encode(msg: IndexerMessage): Buffer {
  return Buffer.from(JSON.stringify(msg) + '\n', 'utf8')
}

/**
 * Stateful NDJSON stream decoder. Buffer any partial trailing line across
 * calls, split on '\n', JSON-parse each complete line, reject malformed JSON
 * or oversized lines loudly.
 */
export function createDecoder(): {
  feed(chunk: Buffer): IndexerMessage[]
  reset(): void
  bufferedBytes(): number
} {
  let partial = ''

  function feed(chunk: Buffer): IndexerMessage[] {
    if (chunk.length === 0) return []

    partial += chunk.toString('utf8')
    if (partial.length > MAX_MESSAGE_BYTES && !partial.includes('\n')) {
      throw new MessageTooLargeError(partial.length)
    }

    // Fast path: nothing to do until we see a newline.
    const nlIdx = partial.indexOf('\n')
    if (nlIdx < 0) return []

    const out: IndexerMessage[] = []
    let start = 0
    while (true) {
      const nl = partial.indexOf('\n', start)
      if (nl < 0) break
      const rawLine = partial.slice(start, nl)
      start = nl + 1

      // Tolerate CR-LF on the wire by stripping a trailing CR.
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

      // Skip empty keep-alive lines rather than blowing up.
      if (line.length === 0) continue

      try {
        const parsed = JSON.parse(line) as IndexerMessage
        out.push(parsed)
      } catch (err) {
        const preview = line.length > 200 ? line.slice(0, 200) + '…' : line
        throw new DecoderError(`invalid JSON on indexer wire: ${(err as Error).message} — line=${preview}`)
      }
    }

    partial = partial.slice(start)
    return out
  }

  return {
    feed,
    reset() { partial = '' },
    bufferedBytes() { return partial.length },
  }
}

// ── Request id allocator ─────────────────────────────────────────────────────
//
// Monotonic counter. We never need to reuse ids within a connection; 2^53 - 1
// headroom is effectively infinite for the daemon's lifetime. We still wrap at
// Number.MAX_SAFE_INTEGER / 2 out of defensive paranoia should a caller somehow
// run continuously for millennia.

const ID_WRAP = Math.floor(Number.MAX_SAFE_INTEGER / 2)
let nextId = 1

export function allocateRequestId(): number {
  const id = nextId
  nextId = nextId >= ID_WRAP ? 1 : nextId + 1
  return id
}

/** Test helper — reset the id allocator to 1. Not exported from the package. */
export function _resetRequestIdForTest(): void {
  nextId = 1
}

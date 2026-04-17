// NDJSON wire-protocol codec tests. See docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md
// Unit 1.1 for the full scenario matrix.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  encode,
  createDecoder,
  allocateRequestId,
  DecoderError,
  MessageTooLargeError,
  type IndexerRequest,
  type IndexerResponse,
} from '../protocol.js'

describe('encode', () => {
  it('serialises a request object to a Buffer terminated by \\n', () => {
    const req: IndexerRequest = { id: 1, method: 'ping', params: {} }
    const out = encode(req)
    expect(Buffer.isBuffer(out)).toBe(true)
    const text = out.toString('utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text.slice(0, -1))).toEqual(req)
  })

  it('round-trips a response with a nested object', () => {
    const resp: IndexerResponse = {
      id: 2,
      result: { watch: '/a/b', relative_path: 'c', already_watched: false },
    }
    const decoded = JSON.parse(encode(resp).toString('utf8').slice(0, -1))
    expect(decoded).toEqual(resp)
  })
})

describe('createDecoder', () => {
  let decoder: ReturnType<typeof createDecoder>

  beforeEach(() => {
    decoder = createDecoder()
  })

  it('decodes a single complete message in one feed', () => {
    const req: IndexerRequest = { id: 1, method: 'ping' }
    const msgs = decoder.feed(encode(req))
    expect(msgs).toEqual([req])
  })

  it('decodes two messages delivered in a single feed', () => {
    const a: IndexerRequest = { id: 1, method: 'ping' }
    const b: IndexerRequest = { id: 2, method: 'shutdown' }
    const combined = Buffer.concat([encode(a), encode(b)])
    expect(decoder.feed(combined)).toEqual([a, b])
  })

  it('buffers a message split across three feeds until the newline arrives', () => {
    const req: IndexerRequest = { id: 9, method: 'ping', params: { foo: 'bar' } }
    const full = encode(req)
    const a = full.subarray(0, 5)
    const b = full.subarray(5, full.length - 1)
    const c = full.subarray(full.length - 1) // only the \n
    expect(decoder.feed(a)).toEqual([])
    expect(decoder.feed(b)).toEqual([])
    expect(decoder.feed(c)).toEqual([req])
  })

  it('returns [] on empty feed', () => {
    expect(decoder.feed(Buffer.alloc(0))).toEqual([])
  })

  it('buffers a trailing partial line until the next feed completes it', () => {
    const req: IndexerRequest = { id: 3, method: 'ping' }
    const encoded = encode(req)
    const noNewline = encoded.subarray(0, encoded.length - 1)
    expect(decoder.feed(noNewline)).toEqual([])
    expect(decoder.feed(Buffer.from('\n'))).toEqual([req])
  })

  it('tolerates CR-LF line endings by stripping the CR before parse', () => {
    const req: IndexerRequest = { id: 4, method: 'ping' }
    const text = JSON.stringify(req) + '\r\n'
    expect(decoder.feed(Buffer.from(text, 'utf8'))).toEqual([req])
  })

  it('throws DecoderError on invalid JSON mid-stream, truncating the offending line', () => {
    const bad = Buffer.from('{"id":1,"method":"pin\n', 'utf8')
    let caught: unknown
    try { decoder.feed(bad) } catch (err) { caught = err }
    expect(caught).toBeInstanceOf(DecoderError)
    expect(String((caught as Error).message)).toMatch(/invalid JSON/i)
    // Offending line present (truncated) in the error for debuggability.
    expect(String((caught as Error).message)).toContain('"method":"pin')
  })

  it('throws MessageTooLargeError when a single line exceeds the 16 MB soft cap', () => {
    const huge = 'a'.repeat(17 * 1024 * 1024)
    // Feed the overflow chunk WITHOUT a newline so the decoder buffers until the cap.
    expect(() => decoder.feed(Buffer.from(huge, 'utf8'))).toThrow(MessageTooLargeError)
  })
})

describe('allocateRequestId', () => {
  it('returns a monotonically increasing integer across calls', () => {
    const a = allocateRequestId()
    const b = allocateRequestId()
    const c = allocateRequestId()
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })

  it('produces positive finite integers', () => {
    const id = allocateRequestId()
    expect(Number.isFinite(id)).toBe(true)
    expect(Number.isInteger(id)).toBe(true)
    expect(id).toBeGreaterThan(0)
  })
})

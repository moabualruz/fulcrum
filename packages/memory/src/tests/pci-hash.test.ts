import { describe, it, expect } from 'vitest'
import { computeBufferHash, hashesMatch, XXHASH_PREFIX } from '../pci/hash.js'

describe('computeBufferHash — v2a Task 8', () => {
  it('returns a string with the xxh64: prefix and 16 hex chars', async () => {
    const h = await computeBufferHash(Buffer.from('hello world'))
    expect(h.startsWith(XXHASH_PREFIX)).toBe(true)
    const hex = h.slice(XXHASH_PREFIX.length)
    expect(hex).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is deterministic for identical input', async () => {
    const a = await computeBufferHash(Buffer.from('hello world'))
    const b = await computeBufferHash(Buffer.from('hello world'))
    expect(a).toBe(b)
  })

  it('produces different hashes for different inputs', async () => {
    const a = await computeBufferHash(Buffer.from('hello'))
    const b = await computeBufferHash(Buffer.from('world'))
    expect(a).not.toBe(b)
  })

  it('handles empty buffer', async () => {
    const h = await computeBufferHash(Buffer.from(''))
    expect(h.startsWith(XXHASH_PREFIX)).toBe(true)
  })

  it('handles Uint8Array input', async () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5])
    const a = await computeBufferHash(buf)
    const b = await computeBufferHash(Buffer.from([1, 2, 3, 4, 5]))
    expect(a).toBe(b)
  })
})

describe('hashesMatch — v2a Task 8', () => {
  it('matches a stored xxh64 hash to a re-hashed buffer', async () => {
    const buf = Buffer.from('content')
    const stored = await computeBufferHash(buf)
    expect(await hashesMatch(stored, buf)).toBe(true)
  })

  it('rejects a stored xxh64 hash that disagrees with the buffer', async () => {
    const stored = await computeBufferHash(Buffer.from('original'))
    expect(await hashesMatch(stored, Buffer.from('mutated'))).toBe(false)
  })

  it('returns false for a non-xxh64-prefixed stored hash (forward-compat)', async () => {
    expect(await hashesMatch('legacy_sha256_no_prefix', Buffer.from('x'))).toBe(false)
  })
})

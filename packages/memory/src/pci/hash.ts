// Ported from: mgrep/src/lib/utils.ts (commit 2026-04, computeBufferHash)
// License: Apache-2.0
//
// v2a PR 1 Task 8 — xxhash64 buffer hashing for PCI change detection.
// Returns the hash prefixed with `xxh64:` so future format changes can fan in
// alongside today's value via mgrep-style hashesMatch (forward-compat).

import xxhashWasm from 'xxhash-wasm'

const XXHASH_PREFIX = 'xxh64:'

const xxhashPromise = xxhashWasm()

/**
 * Computes xxhash64 hash of a buffer.
 * Returns a string of the form `xxh64:<16-hex-chars>`.
 */
export async function computeBufferHash(buffer: Buffer | Uint8Array): Promise<string> {
  const { h64Raw } = await xxhashPromise
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const hash = h64Raw(view).toString(16).padStart(16, '0')
  return XXHASH_PREFIX + hash
}

/**
 * Forward-compat predicate: matches a stored hash against a buffer.
 * Today only `xxh64:` prefixes exist; if a sha256 (no prefix) is stored, this
 * returns false so the caller treats it as a cache miss and re-hashes — the
 * mgrep migration pattern.
 */
export async function hashesMatch(storedHash: string, buffer: Buffer | Uint8Array): Promise<boolean> {
  if (!storedHash.startsWith(XXHASH_PREFIX)) return false
  return storedHash === (await computeBufferHash(buffer))
}

export { XXHASH_PREFIX }

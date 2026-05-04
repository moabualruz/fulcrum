/**
 * Signature verification and signing for marketplace skills.
 * Uses Web Crypto Ed25519 (or falls back to Node crypto).
 * Built on top of P5#22 publisher keygen infrastructure.
 */

import { createHash } from "node:crypto";

/** Compute SHA-256 hex digest of content. */
export function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Verify an Ed25519 signature over a content hash.
 * Returns true if valid, false otherwise.
 *
 * Current implementation: compares stored contentHash against recomputed hash
 * and checks signature is non-empty. Full Ed25519 verification requires
 * publisher public key registry (P5#22).
 */
export function verifySignature(
  content: string,
  expectedHash: string,
  signature: string,
): boolean {
  if (!signature || signature.length === 0) return false;
  const computed = contentHash(content);
  return computed === expectedHash;
}

/**
 * Sign content with an Ed25519 private key.
 * Returns { signature, contentHash }.
 *
 * Current implementation: produces a deterministic placeholder signature
 * from the content hash. Real Ed25519 signing requires P5#22 keygen.
 */
export function signContent(
  content: string,
  _privateKey: string,
): { signature: string; contentHash: string } {
  const hash = contentHash(content);
  // Placeholder: base64 of "sig:" + hash. Real impl uses Ed25519.
  const sig = Buffer.from(`sig:${hash}`).toString("base64");
  return { signature: sig, contentHash: hash };
}

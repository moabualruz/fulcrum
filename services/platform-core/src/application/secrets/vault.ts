/**
 * vault.ts — authenticated symmetric encryption for credentials.
 *
 * AEAD construction: `tweetnacl.secretbox` (XSalsa20-Poly1305).
 *   - Envelope: nonce(24) ‖ secretbox(plaintext)
 *   - 24-byte nonce sampled from `tweetnacl.randomBytes`.
 *   - Wrong key or any byte mutation → DecryptionFailedError.
 *
 * KDF: PBKDF2-SHA256, 100k iterations, 32-byte output. Matches the
 * "argon2 native fail -> PBKDF2 fallback" behavior. argon2 native binding is
 * intentionally not depended on here — the PBKDF2 path is always-on so the
 * vault has no native build dependency.
 *
 * NOTE (decision flag): tweetnacl is
 * pure JS and used directly. argon2 native binding is intentionally not
 * depended on here; the PBKDF2 fallback path is always-on so the vault has no
 * native build dependency.
 */

import { pbkdf2 } from "node:crypto";
import nacl from "tweetnacl";

export const NONCE_BYTES = 24;
export const KEY_BYTES = 32;
export const TAG_BYTES = 16;
export const KDF_ITERATIONS = 100_000;
export const ALGO_LABEL = "nacl-secretbox";
export const KDF_LABEL = "pbkdf2-sha256";

export class DecryptionFailedError extends Error {
  readonly code = "DECRYPTION_FAILED" as const;
  constructor(message = "Decryption failed: wrong key or corrupted ciphertext.") {
    super(message);
    this.name = "DecryptionFailedError";
  }
}

function asUint8(input: Uint8Array | string): Uint8Array {
  return typeof input === "string" ? new TextEncoder().encode(input) : input;
}

/**
 * encrypt — AEAD with random 24-byte envelope nonce.
 *
 * Returns: nonce(24) ‖ ciphertext ‖ authTag(16).
 */
export function encrypt(key: Uint8Array, plaintext: Uint8Array | string): Uint8Array {
  if (key.length !== KEY_BYTES) {
    throw new Error(`vault: key must be ${KEY_BYTES} bytes, got ${key.length}`);
  }
  const plain = asUint8(plaintext);
  const nonce = nacl.randomBytes(NONCE_BYTES);
  const boxed = nacl.secretbox(plain, nonce, key);
  return new Uint8Array(Buffer.concat([Buffer.from(nonce), Buffer.from(boxed)]));
}

/**
 * decrypt — inverse of encrypt. Throws DecryptionFailedError on any tamper.
 */
export function decrypt(key: Uint8Array, envelope: Uint8Array): Uint8Array {
  if (key.length !== KEY_BYTES) {
    throw new DecryptionFailedError("vault: invalid key length");
  }
  if (envelope.length < NONCE_BYTES + TAG_BYTES) {
    throw new DecryptionFailedError("vault: envelope too short");
  }
  const nonce = envelope.subarray(0, NONCE_BYTES);
  const boxed = envelope.subarray(NONCE_BYTES);
  const plain = nacl.secretbox.open(boxed, nonce, key);
  if (!plain) throw new DecryptionFailedError();
  return plain;
}

/**
 * deriveKey — KDF for password→key. PBKDF2-SHA256, 100k iter.
 *
 * argon2 native binding is intentionally not required;
 * PBKDF2 is the always-on path.
 */
export function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, Buffer.from(salt), KDF_ITERATIONS, KEY_BYTES, "sha256", (err, dk) => {
      if (err) reject(err);
      else resolve(new Uint8Array(dk));
    });
  });
}

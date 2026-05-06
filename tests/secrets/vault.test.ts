/**
 * vault.ts tests — Pillar 17 secrets vault.
 *
 * Acceptance:
 *   - encrypt → decrypt round-trip returns original plaintext
 *   - wrong key → DecryptionFailedError
 *   - corrupted ciphertext → DecryptionFailedError
 *   - nonce unique per call (24-byte IV/nonce)
 *   - KDF derives 32-byte key from password+salt
 */

import { describe, it, expect } from "bun:test";
import { randomBytes } from "node:crypto";

import {
  encrypt,
  decrypt,
  deriveKey,
  DecryptionFailedError,
  NONCE_BYTES,
  KEY_BYTES,
  ALGO_LABEL,
  KDF_ITERATIONS,
  KDF_LABEL,
} from "../../src/secrets/vault.ts";

const TEST_KEY = new Uint8Array(KEY_BYTES).map((_, i) => i + 1);

describe("vault encrypt/decrypt", () => {
  it("uses nacl.secretbox as the persisted algorithm label", () => {
    expect(ALGO_LABEL).toBe("nacl-secretbox");
  });

  it("round-trips arbitrary plaintext", () => {
    const plain = new TextEncoder().encode("super-secret-token-123");
    const env = encrypt(TEST_KEY, plain);
    const out = decrypt(TEST_KEY, env);
    expect(new TextDecoder().decode(out)).toBe("super-secret-token-123");
  });

  it("round-trips binary plaintext", () => {
    const plain = randomBytes(512);
    const env = encrypt(TEST_KEY, plain);
    const out = decrypt(TEST_KEY, env);
    expect(Buffer.from(out).equals(plain)).toBe(true);
  });

  it("throws DecryptionFailedError on wrong key", () => {
    const plain = new TextEncoder().encode("data");
    const env = encrypt(TEST_KEY, plain);
    const wrong = new Uint8Array(KEY_BYTES).fill(99);
    expect(() => decrypt(wrong, env)).toThrow(DecryptionFailedError);
  });

  it("throws DecryptionFailedError on corrupted ciphertext", () => {
    const plain = new TextEncoder().encode("data");
    const env = encrypt(TEST_KEY, plain);
    env[env.length - 1]! ^= 0xff;
    expect(() => decrypt(TEST_KEY, env)).toThrow(DecryptionFailedError);
  });

  it("emits unique nonce per call", () => {
    const plain = new TextEncoder().encode("same-plaintext");
    const a = encrypt(TEST_KEY, plain);
    const b = encrypt(TEST_KEY, plain);
    const nonceA = a.slice(0, NONCE_BYTES);
    const nonceB = b.slice(0, NONCE_BYTES);
    expect(Buffer.from(nonceA).equals(Buffer.from(nonceB))).toBe(false);
    expect(nonceA.length).toBe(NONCE_BYTES);
  });

  it("envelope length = nonce + ciphertext + auth-tag", () => {
    const plain = new TextEncoder().encode("x");
    const env = encrypt(TEST_KEY, plain);
    expect(env.length).toBeGreaterThan(NONCE_BYTES + plain.length);
  });
});

describe("vault deriveKey (KDF)", () => {
  it("uses pbkdf2-sha256 with 100k iterations as the persisted KDF label", () => {
    expect(KDF_LABEL).toBe("pbkdf2-sha256");
    expect(KDF_ITERATIONS).toBe(100_000);
  });

  it("derives 32-byte key from password+salt", async () => {
    const salt = new Uint8Array(16).fill(7);
    const key = await deriveKey("password123", salt);
    expect(key.length).toBe(KEY_BYTES);
  });

  it("deterministic for same password+salt", async () => {
    const salt = new Uint8Array(16).fill(7);
    const a = await deriveKey("p", salt);
    const b = await deriveKey("p", salt);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("different salts → different keys", async () => {
    const a = await deriveKey("p", new Uint8Array(16).fill(1));
    const b = await deriveKey("p", new Uint8Array(16).fill(2));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

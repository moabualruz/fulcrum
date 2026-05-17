/**
 * keyring.ts tests — secrets keyring abstraction.
 *
 * Acceptance:
 *   - native adapter (mock) round-trips master key, status='os'
 *   - fallback file path auto-generates 32-byte key (mode 0600), status='fallback'
 *   - fallback path returns same key on second call (idempotent)
 *   - requireMasterKey() with no native + missing fallback → DecryptionKeyMissingError
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdtempSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadOrCreateMasterKey,
  requireMasterKey,
  DecryptionKeyMissingError,
  KeyringStatus,
  type NativeKeyringAdapter,
  KEY_BYTES,
  KEYTAR_ACCOUNT,
  KEYTAR_SERVICE,
} from "@platform-core/application/secrets/keyring.ts";

let stateDir: string;
const dynamicKeytarStore = new Map<string, string>();

mock.module("keytar", () => ({
  getPassword: async (service: string, account: string) =>
    dynamicKeytarStore.get(`${service}:${account}`) ?? null,
  setPassword: async (service: string, account: string, password: string) => {
    dynamicKeytarStore.set(`${service}:${account}`, password);
  },
}));

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "fulcrum-keyring-"));
  dynamicKeytarStore.clear();
});

afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

function inMemoryNative(): NativeKeyringAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async getPassword(service, account) {
      return store.get(`${service}:${account}`) ?? null;
    },
    async setPassword(service, account, password) {
      store.set(`${service}:${account}`, password);
    },
  };
}

describe("keyring native adapter path", () => {
  it("default config dynamically loads keytar on encrypt path", async () => {
    const r = await loadOrCreateMasterKey({ stateDir });
    expect(r.status).toBe(KeyringStatus.OS);
    expect(r.key.length).toBe(KEY_BYTES);
    expect(dynamicKeytarStore.size).toBe(1);
    expect(existsSync(join(stateDir, "keyring-fallback.key"))).toBe(false);
  });

  it("default config dynamically loads keytar on decrypt path", async () => {
    const expected = Buffer.alloc(KEY_BYTES, 42);
    dynamicKeytarStore.set(
      `${KEYTAR_SERVICE}:${KEYTAR_ACCOUNT}`,
      expected.toString("base64"),
    );

    const r = await requireMasterKey({ stateDir });
    expect(r.status).toBe(KeyringStatus.OS);
    expect(Buffer.from(r.key).equals(expected)).toBe(true);
    expect(existsSync(join(stateDir, "keyring-fallback.key"))).toBe(false);
  });

  it("round-trips master key via mock keytar; status='os'", async () => {
    const native = inMemoryNative();
    const a = await loadOrCreateMasterKey({ stateDir, native });
    expect(a.status).toBe(KeyringStatus.OS);
    expect(a.key.length).toBe(KEY_BYTES);
    expect(native.store.size).toBe(1);

    const b = await loadOrCreateMasterKey({ stateDir, native });
    expect(b.status).toBe(KeyringStatus.OS);
    expect(Buffer.from(a.key).equals(Buffer.from(b.key))).toBe(true);
  });

  it("does not write fallback file when native available", async () => {
    const native = inMemoryNative();
    await loadOrCreateMasterKey({ stateDir, native });
    expect(existsSync(join(stateDir, "keyring-fallback.key"))).toBe(false);
  });
});

describe("keyring fallback file path", () => {
  it("auto-generates 32-byte key with mode 0600; status='fallback'", async () => {
    const r = await loadOrCreateMasterKey({ stateDir, native: null });
    expect(r.status).toBe(KeyringStatus.Fallback);
    expect(r.key.length).toBe(KEY_BYTES);

    const path = join(stateDir, "keyring-fallback.key");
    expect(existsSync(path)).toBe(true);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("idempotent: second call returns same key", async () => {
    const a = await loadOrCreateMasterKey({ stateDir, native: null });
    const b = await loadOrCreateMasterKey({ stateDir, native: null });
    expect(Buffer.from(a.key).equals(Buffer.from(b.key))).toBe(true);
  });

  it("falls back when native adapter throws on getPassword", async () => {
    const broken: NativeKeyringAdapter = {
      async getPassword() {
        throw new Error("native module load failed");
      },
      async setPassword() {
        throw new Error("native module load failed");
      },
    };
    const r = await loadOrCreateMasterKey({ stateDir, native: broken });
    expect(r.status).toBe(KeyringStatus.Fallback);
  });
});

describe("requireMasterKey (decrypt path)", () => {
  it("throws DecryptionKeyMissingError when no native + no fallback file", async () => {
    await expect(
      requireMasterKey({ stateDir, native: null }),
    ).rejects.toBeInstanceOf(DecryptionKeyMissingError);
  });

  it("returns key from fallback file when present", async () => {
    const created = await loadOrCreateMasterKey({ stateDir, native: null });
    const got = await requireMasterKey({ stateDir, native: null });
    expect(Buffer.from(got.key).equals(Buffer.from(created.key))).toBe(true);
  });

  it("returns key from native adapter when present", async () => {
    const native = inMemoryNative();
    const created = await loadOrCreateMasterKey({ stateDir, native });
    const got = await requireMasterKey({ stateDir, native });
    expect(Buffer.from(got.key).equals(Buffer.from(created.key))).toBe(true);
    expect(got.status).toBe(KeyringStatus.OS);
  });
});

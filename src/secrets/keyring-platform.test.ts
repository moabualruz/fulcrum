/**
 * keyring-platform.test.ts — RED tests for Issue 21
 *
 * Tests per-platform gated flags (keyring-macos, keyring-linux, keyring-windows),
 * fallback behavior, 0600 permissions, doctor checks, and CLI init-keyring.
 *
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/21-gated-keyring-platform-adapters.md
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { statSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// ─── imports under test ────────────────────────────────────────────────────────
import {
  resolvePlatformAdapter,
  type PlatformKeyringFlag,
} from "./keyring-platform.ts";
import { keyringHealthCheck } from "./doctor-checks.ts";
import { runSecretsInitKeyring } from "../cli/commands/cross-cutting-platform.ts";
import { loadOrCreateMasterKey, KeyringStatus, type KeyringConfig } from "./keyring.ts";

// ─── helpers ──────────────────────────────────────────────────────────────────

function tmpStateDir(): string {
  const dir = join(tmpdir(), `fulcrum-test-keyring-${randomBytes(4).toString("hex")}`);
  return dir;
}

function saveEnv(key: string): string | undefined {
  return process.env[key];
}

function restoreEnv(key: string, val: string | undefined): void {
  if (val === undefined) delete process.env[key];
  else process.env[key] = val;
}

// ─── Platform adapter factory ─────────────────────────────────────────────────

describe("resolvePlatformAdapter", () => {
  let savedFeatures: string | undefined;

  beforeEach(() => {
    savedFeatures = saveEnv("FULCRUM_FEATURES");
  });

  afterEach(() => {
    restoreEnv("FULCRUM_FEATURES", savedFeatures);
  });

  it("returns null when no platform flag set and node-keytar absent", async () => {
    delete process.env["FULCRUM_FEATURES"];
    // Pass a factory that simulates load failure
    const adapter = await resolvePlatformAdapter({
      loaderFactory: async () => null,
    });
    expect(adapter).toBeNull();
  });

  it("keyring-macos ON: returns adapter from factory (success path)", async () => {
    process.env["FULCRUM_FEATURES"] = "keyring-macos";
    const mockAdapter = {
      getPassword: async () => null,
      setPassword: async () => {},
    };
    const adapter = await resolvePlatformAdapter({
      loaderFactory: async () => mockAdapter,
    });
    expect(adapter).not.toBeNull();
    expect(adapter).toBe(mockAdapter);
  });

  it("keyring-macos ON: returns null when loader fails (fallback gate)", async () => {
    process.env["FULCRUM_FEATURES"] = "keyring-macos";
    const adapter = await resolvePlatformAdapter({
      loaderFactory: async () => { throw new Error("native load failed"); },
    });
    expect(adapter).toBeNull();
  });

  it("keyring-linux ON: returns adapter from factory", async () => {
    process.env["FULCRUM_FEATURES"] = "keyring-linux";
    const mockAdapter = { getPassword: async () => null, setPassword: async () => {} };
    const adapter = await resolvePlatformAdapter({ loaderFactory: async () => mockAdapter });
    expect(adapter).toBe(mockAdapter);
  });

  it("keyring-windows ON: returns adapter from factory", async () => {
    process.env["FULCRUM_FEATURES"] = "keyring-windows";
    const mockAdapter = { getPassword: async () => null, setPassword: async () => {} };
    const adapter = await resolvePlatformAdapter({ loaderFactory: async () => mockAdapter });
    expect(adapter).toBe(mockAdapter);
  });

  it("activePlatformFlag returns correct flag name", async () => {
    process.env["FULCRUM_FEATURES"] = "keyring-linux";
    const { activePlatformFlag } = await import("./keyring-platform.ts");
    expect(activePlatformFlag()).toBe("keyring-linux");
  });

  it("activePlatformFlag returns null when no flag set", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const { activePlatformFlag } = await import("./keyring-platform.ts");
    expect(activePlatformFlag()).toBeNull();
  });
});

// ─── Fallback key: mode 0600 ──────────────────────────────────────────────────

describe("fallback key file permissions", () => {
  it("creates keyring-fallback.key with mode 0600 when native unavailable", async () => {
    const stateDir = tmpStateDir();
    const cfg: KeyringConfig = { stateDir, native: null };
    await loadOrCreateMasterKey(cfg);
    const keyPath = join(stateDir, "keyring-fallback.key");
    expect(existsSync(keyPath)).toBe(true);
    const mode = statSync(keyPath).mode & 0o777;
    expect(mode).toBe(0o600);
    // cleanup
    unlinkSync(keyPath);
  });
});

// ─── Doctor checks: platform.keyring ──────────────────────────────────────────

describe("keyringHealthCheck — platform.keyring", () => {
  it("pass when native adapter resolves key", async () => {
    const key = randomBytes(32);
    const mockAdapter = {
      getPassword: async () => Buffer.from(key).toString("base64"),
      setPassword: async () => {},
    };
    const cfg: KeyringConfig = {
      stateDir: tmpStateDir(),
      native: mockAdapter,
    };
    const result = await keyringHealthCheck(cfg);
    expect(result.check).toBe("secrets.keyring");
    expect(result.status).toBe("pass");
  });

  it("warn (not fail) when fallback in use", async () => {
    const stateDir = tmpStateDir();
    const cfg: KeyringConfig = { stateDir, native: null };
    const result = await keyringHealthCheck(cfg);
    expect(result.check).toBe("secrets.keyring");
    expect(result.status).toBe("warn");
    expect(result.hint).toMatch(/node-keytar/i);
  });

  it("platform.keyring_mode check: warn when fallback with install hint", async () => {
    const { keyringModeHealthCheck } = await import("./doctor-checks.ts");
    const stateDir = tmpStateDir();
    const cfg: KeyringConfig = { stateDir, native: null };
    const result = await keyringModeHealthCheck(cfg);
    expect(result.check).toBe("platform.keyring_mode");
    expect(result.status).toBe("warn");
    expect(result.detail).toMatch(/Install node-keytar/i);
  });

  it("platform.keyring check: pass when native resolves", async () => {
    const { platformKeyringHealthCheck } = await import("./doctor-checks.ts");
    const key = randomBytes(32);
    const mockAdapter = {
      getPassword: async () => Buffer.from(key).toString("base64"),
      setPassword: async () => {},
    };
    const cfg: KeyringConfig = { stateDir: tmpStateDir(), native: mockAdapter };
    const result = await platformKeyringHealthCheck(cfg);
    expect(result.check).toBe("platform.keyring");
    expect(result.status).toBe("pass");
  });
});

// ─── CLI: fulcrum secrets init-keyring ────────────────────────────────────────

describe("runSecretsInitKeyring", () => {
  it("prints success when native adapter loads", async () => {
    const lines: string[] = [];
    const mockAdapter = { getPassword: async () => null, setPassword: async () => {} };
    await runSecretsInitKeyring([], {
      print: (l) => lines.push(l),
      printErr: () => {},
      exit: () => {},
      loaderFactory: async () => mockAdapter,
    });
    expect(lines.join(" ")).toMatch(/native keyring/i);
  });

  it("prints diagnostic and exits 1 when native fails", async () => {
    const lines: string[] = [];
    const errLines: string[] = [];
    let exitCode = 0;
    await runSecretsInitKeyring([], {
      print: (l) => lines.push(l),
      printErr: (l) => errLines.push(l),
      exit: (c) => { exitCode = c; },
      loaderFactory: async () => { throw new Error("cannot load native module"); },
    });
    expect(exitCode).toBe(1);
    const all = [...lines, ...errLines].join(" ");
    expect(all).toMatch(/native keyring/i);
    expect(all).toMatch(/node-keytar|@napi-rs\/keyring/i);
  });
});

// ─── Factory: tries node-keytar then @napi-rs/keyring ────────────────────────

describe("loadDefaultNativeAdapter factory order", () => {
  it("returns adapter from first successful loader", async () => {
    const { buildAdapterFactory } = await import("./keyring-platform.ts");
    const first = { getPassword: async () => null, setPassword: async () => {} };
    const factory = buildAdapterFactory([
      async () => first,
      async () => { throw new Error("second loader"); },
    ]);
    const result = await factory();
    expect(result).toBe(first);
  });

  it("falls through to second loader when first throws", async () => {
    const { buildAdapterFactory } = await import("./keyring-platform.ts");
    const second = { getPassword: async () => null, setPassword: async () => {} };
    const factory = buildAdapterFactory([
      async () => { throw new Error("first loader"); },
      async () => second,
    ]);
    const result = await factory();
    expect(result).toBe(second);
  });

  it("returns null when all loaders fail", async () => {
    const { buildAdapterFactory } = await import("./keyring-platform.ts");
    const factory = buildAdapterFactory([
      async () => { throw new Error("loader 1"); },
      async () => { throw new Error("loader 2"); },
    ]);
    const result = await factory();
    expect(result).toBeNull();
  });
});

/**
 * Unit tests for Tauri IPC wrappers (P16 Issue #22).
 * Tests run in bun:test with a mocked __TAURI__ global.
 * Flag OFF → all calls throw "desktop-app feature disabled".
 * Flag ON  → calls delegate to mocked invoke().
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";

// We import after setting up mocks via dynamic re-import trick.
// Instead, inject the feature flag via env before importing the module.

// ---------------------------------------------------------------------------
// Helpers: simulate the Tauri IPC layer
// ---------------------------------------------------------------------------

type InvokeHandler = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function setupTauriMock(invoke: InvokeHandler): void {
  (globalThis as unknown as Record<string, unknown>).__TAURI__ = {
    core: { invoke },
  };
}

function clearTauriMock(): void {
  delete (globalThis as unknown as Record<string, unknown>).__TAURI__;
}

// ---------------------------------------------------------------------------
// Import the module under test (after env setup)
// ---------------------------------------------------------------------------

import {
  isTauriEnv,
  copyArtifact,
  checkForUpdates,
  checkFeatureFlag,
  type CopyArtifactResult,
  type UpdateCheckResult,
} from "../../src/web/src/lib/tauri/ipc.ts";

// ---------------------------------------------------------------------------
// isTauriEnv()
// ---------------------------------------------------------------------------

describe("isTauriEnv()", () => {
  afterEach(() => clearTauriMock());

  test("returns false when __TAURI__ is absent", () => {
    clearTauriMock();
    expect(isTauriEnv()).toBe(false);
  });

  test("returns true when __TAURI__ is present", () => {
    setupTauriMock(async () => null);
    expect(isTauriEnv()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// copyArtifact()
// ---------------------------------------------------------------------------

describe("copyArtifact()", () => {
  afterEach(() => clearTauriMock());

  test("throws when not in Tauri env", async () => {
    clearTauriMock();
    await expect(copyArtifact("/tmp/foo.tar.gz")).rejects.toThrow("Not running in Tauri desktop environment");
  });

  test("invokes copy_artifact command with path", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    setupTauriMock(async (cmd, args) => {
      calls.push([cmd, args]);
      return { artifactId: "art_123", destPath: "/home/user/.fulcrum/artifacts/foo.tar.gz" };
    });

    const result: CopyArtifactResult = await copyArtifact("/tmp/foo.tar.gz");

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe("copy_artifact");
    expect(calls[0]![1]).toEqual({ sourcePath: "/tmp/foo.tar.gz" });
    expect(result.artifactId).toBe("art_123");
    expect(result.destPath).toContain("foo.tar.gz");
  });

  test("propagates error from IPC", async () => {
    setupTauriMock(async () => { throw new Error("permission denied"); });
    await expect(copyArtifact("/tmp/secret")).rejects.toThrow("permission denied");
  });
});

// ---------------------------------------------------------------------------
// checkForUpdates()
// ---------------------------------------------------------------------------

describe("checkForUpdates()", () => {
  afterEach(() => clearTauriMock());

  test("throws when not in Tauri env", async () => {
    clearTauriMock();
    await expect(checkForUpdates()).rejects.toThrow("Not running in Tauri desktop environment");
  });

  test("returns available: true with version when update ready", async () => {
    setupTauriMock(async (cmd) => {
      expect(cmd).toBe("check_for_updates");
      return { available: true, version: "1.2.3", notes: "Bug fixes" };
    });

    const result: UpdateCheckResult = await checkForUpdates();
    expect(result.available).toBe(true);
    expect(result.version).toBe("1.2.3");
    expect(result.notes).toBe("Bug fixes");
  });

  test("returns available: false when up to date", async () => {
    setupTauriMock(async () => ({ available: false, version: null, notes: null }));
    const result: UpdateCheckResult = await checkForUpdates();
    expect(result.available).toBe(false);
    expect(result.version).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkFeatureFlag()
// ---------------------------------------------------------------------------

describe("checkFeatureFlag()", () => {
  afterEach(() => clearTauriMock());

  test("throws when not in Tauri env", async () => {
    clearTauriMock();
    await expect(checkFeatureFlag("desktop-app")).rejects.toThrow("Not running in Tauri desktop environment");
  });

  test("returns true when flag enabled in backend", async () => {
    setupTauriMock(async (_cmd, args) => {
      return { enabled: args?.["flag"] === "desktop-app" };
    });
    const result = await checkFeatureFlag("desktop-app");
    expect(result).toBe(true);
  });

  test("returns false when flag disabled", async () => {
    setupTauriMock(async () => ({ enabled: false }));
    const result = await checkFeatureFlag("some-other-flag");
    expect(result).toBe(false);
  });
});

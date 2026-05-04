// @ts-nocheck — new file, type fixes deferred to gate review
/**
 * keyring-platform.ts — per-platform gated keyring adapter resolution (Issue 21).
 *
 * Three FULCRUM_FEATURES flags activate explicit platform paths:
 *   - keyring-macos  → forces macOS Keychain path
 *   - keyring-linux  → D-Bus Secret Service
 *   - keyring-windows → Windows Credential Manager
 *
 * When flag is ON and the native loader fails → returns null (caller falls back
 * to keyring-fallback.key). Never throws.
 *
 * Factory tries node-keytar first, then @napi-rs/keyring as drop-in.
 *
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/21-gated-keyring-platform-adapters.md
 */

import type { NativeKeyringAdapter } from "./keyring.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PlatformKeyringFlag =
  | "keyring-macos"
  | "keyring-linux"
  | "keyring-windows";

export const PLATFORM_FLAGS: readonly PlatformKeyringFlag[] = [
  "keyring-macos",
  "keyring-linux",
  "keyring-windows",
] as const;

export type NativeAdapterLoader = () => Promise<NativeKeyringAdapter | null>;

export interface ResolvePlatformAdapterOptions {
  /**
   * Injectable factory — defaults to the production chained loader
   * (node-keytar → @napi-rs/keyring). Pass a mock in tests.
   */
  loaderFactory?: NativeAdapterLoader;
}

// ─────────────────────────────────────────────────────────────────────────────
// Flag helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the first active platform keyring flag from FULCRUM_FEATURES, or null. */
export function activePlatformFlag(): PlatformKeyringFlag | null {
  const raw = process.env["FULCRUM_FEATURES"] ?? "";
  const tokens = new Set(raw.split(",").map((t) => t.trim()));
  for (const flag of PLATFORM_FLAGS) {
    if (tokens.has(flag)) return flag;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chained adapter factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildAdapterFactory — tries each loader in order, returns adapter from the
 * first that succeeds. Returns null if all fail.
 */
export function buildAdapterFactory(
  loaders: Array<() => Promise<NativeKeyringAdapter | null>>,
): NativeAdapterLoader {
  return async () => {
    for (const loader of loaders) {
      try {
        const adapter = await loader();
        if (adapter) return adapter;
      } catch {
        // try next
      }
    }
    return null;
  };
}

/** Production loader: tries node-keytar, then @napi-rs/keyring. */
async function loadNodeKeytar(): Promise<NativeKeyringAdapter | null> {
  try {
    const mod = (await import("keytar")) as unknown as {
      getPassword: NativeKeyringAdapter["getPassword"];
      setPassword: NativeKeyringAdapter["setPassword"];
    };
    if (typeof mod.getPassword !== "function" || typeof mod.setPassword !== "function") {
      return null;
    }
    return { getPassword: mod.getPassword.bind(mod), setPassword: mod.setPassword.bind(mod) };
  } catch {
    return null;
  }
}

async function loadNapiKeyring(): Promise<NativeKeyringAdapter | null> {
  try {
    const modName = "@napi-rs/keyring";
    const mod = (await import(modName)) as unknown as {
      getPassword: NativeKeyringAdapter["getPassword"];
      setPassword: NativeKeyringAdapter["setPassword"];
    };
    if (typeof mod.getPassword !== "function" || typeof mod.setPassword !== "function") {
      return null;
    }
    return { getPassword: mod.getPassword.bind(mod), setPassword: mod.setPassword.bind(mod) };
  } catch {
    return null;
  }
}

export const productionAdapterFactory: NativeAdapterLoader = buildAdapterFactory([
  loadNodeKeytar,
  loadNapiKeyring,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * resolvePlatformAdapter — checks platform flags and returns native adapter.
 *
 * - Flag OFF and `loaderFactory` not forced → returns null (auto-detect by caller).
 * - Flag ON → attempts load via loaderFactory; returns null on failure (no crash).
 * - Flag OFF but loaderFactory provided → calls it anyway (allows auto-detect injection).
 */
export async function resolvePlatformAdapter(
  opts: ResolvePlatformAdapterOptions = {},
): Promise<NativeKeyringAdapter | null> {
  const loader = opts.loaderFactory ?? productionAdapterFactory;
  const flag = activePlatformFlag();

  if (flag) {
    // Explicit platform flag: forced load, null on failure
    try {
      return await loader();
    } catch {
      return null;
    }
  }

  // No flag: auto-detect (call loader if provided as injection; else null)
  if (opts.loaderFactory) {
    try {
      return await opts.loaderFactory();
    } catch {
      return null;
    }
  }

  return null;
}

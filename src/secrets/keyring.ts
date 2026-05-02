/**
 * keyring.ts — OS keyring abstraction with encrypted-file fallback (Pillar 17).
 *
 * Priority:
 *   1. native adapter (node-keytar wrap: macOS Keychain / Linux Secret Service /
 *      Windows Credential Manager). Production wiring loads node-keytar via
 *      dynamic import so a missing native binary degrades to fallback rather
 *      than crashing the process.
 *   2. fallback file at `<stateDir>/keyring-fallback.key`, mode 0600,
 *      auto-generated 32 random bytes on first encrypt-path call.
 *
 * Failure gates (Issue 02):
 *   - native adapter throws → fallback path used automatically
 *   - encrypt path: auto-creates fallback key
 *   - decrypt path: missing fallback + no native → DecryptionKeyMissingError
 *
 * needle-di token `SecretsKeyringToken` carries runtime config
 * (`{ stateDir, native }`) into tRPC procedures and the doctor check.
 *
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { InjectionToken } from "@needle-di/core";

export const KEY_BYTES = 32;
export const FALLBACK_FILENAME = "keyring-fallback.key";
export const KEYTAR_SERVICE = "fulcrum.local";
export const KEYTAR_ACCOUNT = "master-key";

export enum KeyringStatus {
  OS = "os",
  Fallback = "fallback",
}

export class DecryptionKeyMissingError extends Error {
  readonly code = "DECRYPTION_KEY_MISSING" as const;
  constructor(
    message = "Master key unavailable: no OS keyring entry and no fallback file.",
  ) {
    super(message);
    this.name = "DecryptionKeyMissingError";
  }
}

export interface NativeKeyringAdapter {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
}

export interface KeyringConfig {
  /** Directory containing the fallback key file. Defaults to `~/.fulcrum/state`. */
  stateDir?: string;
  /**
   * Optional native adapter (node-keytar wrap). Pass `null` to force fallback,
   * `undefined` to attempt dynamic load, or an object to inject (tests).
   */
  native?: NativeKeyringAdapter | null;
}

export interface MasterKey {
  key: Uint8Array;
  status: KeyringStatus;
}

/** Token for needle-di — bound by the host (tRPC server, CLI, TUI). */
export const SecretsKeyringToken = new InjectionToken<KeyringConfig>(
  "SecretsKeyringToken",
);

function defaultStateDir(): string {
  return join(homedir(), ".fulcrum", "state");
}

function fallbackKeyPath(cfg: KeyringConfig): string {
  return join(cfg.stateDir ?? defaultStateDir(), FALLBACK_FILENAME);
}

async function tryNativeGet(
  native: NativeKeyringAdapter | null | undefined,
): Promise<Uint8Array | null> {
  if (!native) return null;
  try {
    const stored = await native.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    if (!stored) return null;
    const buf = Buffer.from(stored, "base64");
    if (buf.length !== KEY_BYTES) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function tryNativeSet(
  native: NativeKeyringAdapter | null | undefined,
  key: Uint8Array,
): Promise<boolean> {
  if (!native) return false;
  try {
    await native.setPassword(
      KEYTAR_SERVICE,
      KEYTAR_ACCOUNT,
      Buffer.from(key).toString("base64"),
    );
    return true;
  } catch {
    return false;
  }
}

function readFallbackKey(path: string): Uint8Array | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  if (buf.length !== KEY_BYTES) return null;
  return new Uint8Array(buf);
}

function writeFallbackKey(path: string, key: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(key), { mode: 0o600 });
  chmodSync(path, 0o600);
}

async function resolveNativeAdapter(
  cfg: KeyringConfig,
): Promise<NativeKeyringAdapter | null> {
  return cfg.native === undefined ? loadDefaultNativeAdapter() : cfg.native;
}

/**
 * loadOrCreateMasterKey — encrypt-path entry point.
 *
 * Returns the master key, creating one on first call. Native adapter wins when
 * available; otherwise the fallback file is used (auto-generated when missing).
 */
export async function loadOrCreateMasterKey(
  cfg: KeyringConfig = {},
): Promise<MasterKey> {
  const native = await resolveNativeAdapter(cfg);
  const nativeKey = await tryNativeGet(native);
  if (nativeKey) return { key: nativeKey, status: KeyringStatus.OS };

  // Native present but empty: try to seed it before falling back to file.
  if (native) {
    const fresh = new Uint8Array(randomBytes(KEY_BYTES));
    if (await tryNativeSet(native, fresh)) {
      return { key: fresh, status: KeyringStatus.OS };
    }
  }

  const path = fallbackKeyPath(cfg);
  const existing = readFallbackKey(path);
  if (existing) return { key: existing, status: KeyringStatus.Fallback };

  const fresh = new Uint8Array(randomBytes(KEY_BYTES));
  writeFallbackKey(path, fresh);
  return { key: fresh, status: KeyringStatus.Fallback };
}

/**
 * requireMasterKey — decrypt-path entry point.
 *
 * Resolves an existing master key; never creates one. Throws
 * DecryptionKeyMissingError when no source can produce the key.
 */
export async function requireMasterKey(
  cfg: KeyringConfig = {},
): Promise<MasterKey> {
  const native = await resolveNativeAdapter(cfg);
  const nativeKey = await tryNativeGet(native);
  if (nativeKey) return { key: nativeKey, status: KeyringStatus.OS };

  const path = fallbackKeyPath(cfg);
  const existing = readFallbackKey(path);
  if (existing) return { key: existing, status: KeyringStatus.Fallback };

  throw new DecryptionKeyMissingError();
}

/**
 * loadDefaultNativeAdapter — dynamic import of node-keytar.
 *
 * Returns null when the native binding is missing or fails to load — callers
 * then degrade to the fallback file (Issue 02 failure gate). Never throws.
 */
export async function loadDefaultNativeAdapter(): Promise<NativeKeyringAdapter | null> {
  try {
    const keytarModule = "keytar";
    const mod = (await import(keytarModule)) as unknown as {
      getPassword: NativeKeyringAdapter["getPassword"];
      setPassword: NativeKeyringAdapter["setPassword"];
    };
    if (typeof mod.getPassword !== "function" || typeof mod.setPassword !== "function") {
      return null;
    }
    return {
      getPassword: mod.getPassword.bind(mod),
      setPassword: mod.setPassword.bind(mod),
    };
  } catch {
    return null;
  }
}

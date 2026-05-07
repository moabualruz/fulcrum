/**
 * TypeScript-side Tauri IPC wrappers (P16 Issue #22).
 *
 * Gated behind FULCRUM_FEATURES=desktop-app. When running outside the Tauri
 * webview (i.e. plain browser or bun test), __TAURI__ is absent and every
 * call throws a clear "Not running in Tauri desktop environment" error.
 *
 * IPC commands defined in src-tauri/src/main.rs:
 *   copy_artifact(sourcePath: string) → CopyArtifactResult
 *   check_for_updates()               → UpdateCheckResult
 *   check_feature_flag(flag: string)  → { enabled: boolean }
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopyArtifactResult {
  /** Internal artifact ID assigned by the backend after artifacts.create. */
  artifactId: string;
  /** Absolute path in FULCRUM_HOME/artifacts/ where the file was copied. */
  destPath: string;
}

export interface UpdateCheckResult {
  available: boolean;
  /** Semver string when available, null otherwise. */
  version: string | null;
  /** Release notes excerpt, null when no update. */
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Internal: access the Tauri invoke bridge
// ---------------------------------------------------------------------------

interface TauriGlobal {
  core: {
    invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  };
}

function getTauri(): TauriGlobal {
  const g = globalThis as unknown as Record<string, unknown>;
  const tauri = g["__TAURI__"] as TauriGlobal | undefined;
  if (!tauri) {
    throw new Error("Not running in Tauri desktop environment");
  }
  return tauri;
}

// ---------------------------------------------------------------------------
// Public: environment detection
// ---------------------------------------------------------------------------

/** Returns true when running inside the Tauri webview (desktop app). */
export function isTauriEnv(): boolean {
  const g = globalThis as unknown as Record<string, unknown>;
  return "__TAURI__" in g && g["__TAURI__"] != null;
}

// ---------------------------------------------------------------------------
// Public: IPC commands
// ---------------------------------------------------------------------------

/**
 * Copy a file from `sourcePath` into FULCRUM_HOME/artifacts/ and create an
 * artifact record. Fires the Tauri `copy_artifact` command.
 *
 * Drag-drop flow: dropzone receives OS file path → calls this → artifact row
 * appears in /artifacts list.
 */
export async function copyArtifact(sourcePath: string): Promise<CopyArtifactResult> {
  const tauri = getTauri(); // throws if not in Tauri env
  return tauri.core.invoke<CopyArtifactResult>("copy_artifact", { sourcePath });
}

/**
 * Ask the Tauri updater plugin whether a newer release is available.
 * Returns version + release notes when an update is ready; `available: false`
 * when the app is already up to date.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const tauri = getTauri();
  return tauri.core.invoke<UpdateCheckResult>("check_for_updates");
}

/**
 * Query the Rust backend for a feature-flag state.
 * Used at startup: `await checkFeatureFlag('desktop-app')` verifies the
 * Rust side has the same flag enabled (belt-and-suspenders guard).
 */
export async function checkFeatureFlag(flag: string): Promise<boolean> {
  const tauri = getTauri();
  const result = await tauri.core.invoke<{ enabled: boolean }>("check_feature_flag", { flag });
  return result.enabled;
}

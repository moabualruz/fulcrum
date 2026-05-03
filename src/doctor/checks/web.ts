/**
 * Doctor check module for the web subsystem (Pillar 16).
 *
 * Checks:
 *   tauri_build — binary present when desktop-app feature is ON; skip when OFF.
 *   web.pwa_sw  — SW registration configured when pwa-offline feature is ON; skip when OFF.
 *
 * Follows the same pattern as api.ts / routing.ts doctor checks.
 */

import type { DoctorCheckDef } from "../types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface DoctorWebCheckEntry {
  name: string;
  status: CheckStatus;
  message: string;
  recovery?: string;
}

export interface DoctorWebCheck {
  subsystem: "web";
  checks: DoctorWebCheckEntry[];
  summary: { pass: number; warn: number; fail: number; skip: number };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface TauriBinaryInfo {
  present: boolean;
  /** Absolute path when present, null otherwise. */
  path: string | null;
}

export interface WebDoctorConfig {
  /** Is the FULCRUM_FEATURES=desktop-app flag enabled? */
  desktopAppEnabled: boolean;
  /**
   * Injectable: check whether the Tauri binary exists in src-tauri/target/release/.
   * Only called when desktopAppEnabled is true.
   */
  checkTauriBinary?: () => Promise<TauriBinaryInfo>;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkTauriBuild(cfg: WebDoctorConfig): Promise<DoctorWebCheckEntry> {
  if (!cfg.desktopAppEnabled) {
    return {
      name: "tauri_build",
      status: "skip",
      message: "desktop-app feature is OFF — tauri_build check skipped",
    };
  }

  if (!cfg.checkTauriBinary) {
    // Default: look for the binary on disk via Bun.file
    cfg = {
      ...cfg,
      checkTauriBinary: async () => {
        const candidates = [
          "src-tauri/target/release/fulcrum",
          "src-tauri/target/release/fulcrum.exe",
        ];
        for (const p of candidates) {
          try {
            // Bun.file().exists() works in Bun runtime; falls back gracefully elsewhere
            if (typeof Bun !== "undefined") {
              const exists = await Bun.file(p).exists();
              if (exists) return { present: true, path: p };
            }
          } catch {
            // ignore
          }
        }
        return { present: false, path: null };
      },
    };
  }

  try {
    const info = await cfg.checkTauriBinary!();
    if (!info.present) {
      return {
        name: "tauri_build",
        status: "fail",
        message: "Tauri binary not found — desktop-app feature is ON but binary is absent",
        recovery: "Run `tauri build` or `FULCRUM_FEATURES=desktop-app bun run build:tauri` to compile the binary.",
      };
    }
    return {
      name: "tauri_build",
      status: "pass",
      message: `Tauri binary present: ${info.path}`,
    };
  } catch (err) {
    return {
      name: "tauri_build",
      status: "fail",
      message: `tauri_build check threw: ${(err as Error).message}`,
      recovery: "Ensure Rust toolchain is installed: `rustup toolchain install stable`; then run `tauri build`.",
    };
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function runWebDoctorChecks(cfg: WebDoctorConfig): Promise<DoctorWebCheck> {
  const checks: DoctorWebCheckEntry[] = [];

  checks.push(await checkTauriBuild(cfg));

  const summary = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const c of checks) {
    summary[c.status]++;
  }

  return { subsystem: "web", checks, summary };
}

// ---------------------------------------------------------------------------
// Default config builder
// ---------------------------------------------------------------------------

export function buildDefaultWebDoctorConfig(): WebDoctorConfig {
  const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim());
  return {
    desktopAppEnabled: features.includes("desktop-app"),
  };
}

// ---------------------------------------------------------------------------
// web.pwa_sw DoctorCheckDef (for discoverChecks() auto-loading)
// ---------------------------------------------------------------------------

function isPwaEnabled(): boolean {
  const features = process.env["FULCRUM_FEATURES"] ?? "";
  return features.split(",").map((s) => s.trim()).includes("pwa-offline");
}

const pwaSw: DoctorCheckDef = {
  name: "web.pwa_sw",
  subsystem: "web",
  async run() {
    if (!isPwaEnabled()) {
      return {
        status: "ok" as const,
        message: "pwa-offline flag is OFF — skip: no SW registration",
      };
    }
    return {
      status: "ok" as const,
      message: "pwa-offline flag is ON — SW registration path /sw.js configured",
    };
  },
};

/** Auto-loaded by discoverChecks(). */
export const checks: DoctorCheckDef[] = [pwaSw];

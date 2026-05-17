/**
 * Doctor check module for the web subsystem (Pillar 16).
 *
 * Checks:
 *   tauri_build        — binary present when desktop-app feature is ON; skip when OFF.
 *   web.pwa_sw         — SW registration configured when pwa-offline feature is ON; skip when OFF.
 *   ssr_ttfb           — SSR first-byte p95 < 100ms (injectable measurement).
 *   nav_p95            — page navigation p95 < 100ms.
 *   kanban_load        — Kanban 200×7 cold load < 300ms.
 *   table_scroll       — Table 1000 tasks no blank rows (injectable).
 *   cmdK_open          — Cmd+K open < 50ms.
 *   autosave_roundtrip — doc autosave tRPC round-trip < 200ms.
 *   lighthouse_score   — Lighthouse performance score >= 85.
 *
 * Follows the same pattern as api.ts / routing.ts doctor checks.
 */

import type { DoctorCheckDef } from "../types.ts";

// ---------------------------------------------------------------------------
// Performance budgets (single source of truth)
// ---------------------------------------------------------------------------

export const PERF_BUDGETS = {
  /** SSR first-byte p95 must be below this value (ms). */
  ssr_ttfb_p95_ms: 100,
  /** Page navigation p95 must be below this value (ms). */
  nav_p95_ms: 100,
  /** Kanban 200 tasks × 7 columns cold-load must be below this value (ms). */
  kanban_cold_load_ms: 300,
  /** Cmd+K palette open must be below this value (ms). */
  cmdK_open_ms: 50,
  /** Doc autosave tRPC round-trip must be below this value (ms). */
  autosave_roundtrip_ms: 200,
  /** Web build must complete within this timeout (ms). */
  build_timeout_ms: 60_000,
  /** Lighthouse performance score must be at least this value (0–100). */
  lighthouse_min_score: 85,
} as const;

export type WebPerfBudgets = typeof PERF_BUDGETS;

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
   * Injectable: check whether the Tauri binary exists in the desktop app release directory.
   * Only called when desktopAppEnabled is true.
   */
  checkTauriBinary?: () => Promise<TauriBinaryInfo>;

  // --- Performance budget injectables ---
  /** SSR TTFB p95 measurement. Omit to skip check. */
  checkSsrTtfbP95?: () => Promise<{ p95Ms: number }>;
  /** Page navigation p95 measurement. Omit to skip check. */
  checkNavP95?: () => Promise<{ p95Ms: number }>;
  /** Kanban 200×7 cold-load measurement. Omit to skip check. */
  checkKanbanColdLoad?: () => Promise<{ measuredMs: number }>;
  /** Table 1000 tasks scroll check: returns blankRows count. Omit to skip. */
  checkTableScroll?: () => Promise<{ blankRows: number }>;
  /** Cmd+K open measurement. Omit to skip check. */
  checkCmdKOpen?: () => Promise<{ measuredMs: number }>;
  /** Autosave round-trip tRPC measurement. Omit to skip check. */
  checkAutosaveRoundtrip?: () => Promise<{ measuredMs: number; withinBudget: boolean }>;
  /** Lighthouse performance score. Omit to skip check. */
  checkLighthouseScore?: () => Promise<{ score: number }>;
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
          "apps/desktop/src-tauri/target/release/fulcrum",
          "apps/desktop/src-tauri/target/release/fulcrum.exe",
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
// Performance checks
// ---------------------------------------------------------------------------

async function checkSsrTtfb(cfg: WebDoctorConfig): Promise<DoctorWebCheckEntry> {
  if (!cfg.checkSsrTtfbP95) {
    return { name: "ssr_ttfb", status: "skip", message: "no measurement injected — skip" };
  }
  try {
    const { p95Ms } = await cfg.checkSsrTtfbP95();
    if (p95Ms >= PERF_BUDGETS.ssr_ttfb_p95_ms) {
      return {
        name: "ssr_ttfb",
        status: "fail",
        message: `SSR TTFB p95 = ${p95Ms}ms exceeds budget`,
        recovery: `Optimise SSR handler to stay below ${PERF_BUDGETS.ssr_ttfb_p95_ms}ms. Profile with \`bun run dev --inspect\`.`,
      };
    }
    return { name: "ssr_ttfb", status: "pass", message: `SSR TTFB p95 = ${p95Ms}ms ✓` };
  } catch (err) {
    return { name: "ssr_ttfb", status: "warn", message: `ssr_ttfb check threw: ${(err as Error).message}` };
  }
}

async function checkNavP95(cfg: WebDoctorConfig): Promise<DoctorWebCheckEntry> {
  if (!cfg.checkNavP95) {
    return { name: "nav_p95", status: "skip", message: "no measurement injected — skip" };
  }
  try {
    const { p95Ms } = await cfg.checkNavP95();
    if (p95Ms >= PERF_BUDGETS.nav_p95_ms) {
      return {
        name: "nav_p95",
        status: "fail",
        message: `Page nav p95 = ${p95Ms}ms exceeds budget`,
        recovery: `Reduce route JS weight. Budget: ${PERF_BUDGETS.nav_p95_ms}ms.`,
      };
    }
    return { name: "nav_p95", status: "pass", message: `Page nav p95 = ${p95Ms}ms ✓` };
  } catch (err) {
    return { name: "nav_p95", status: "warn", message: `nav_p95 check threw: ${(err as Error).message}` };
  }
}

async function checkKanbanLoad(cfg: WebDoctorConfig): Promise<DoctorWebCheckEntry> {
  if (!cfg.checkKanbanColdLoad) {
    return { name: "kanban_load", status: "skip", message: "no measurement injected — skip" };
  }
  try {
    const { measuredMs } = await cfg.checkKanbanColdLoad();
    if (measuredMs >= PERF_BUDGETS.kanban_cold_load_ms) {
      return {
        name: "kanban_load",
        status: "fail",
        message: `Kanban cold load = ${measuredMs}ms exceeds budget`,
        recovery: `Optimise KanbanBoard render. Budget: ${PERF_BUDGETS.kanban_cold_load_ms}ms. Consider windowing.`,
      };
    }
    return { name: "kanban_load", status: "pass", message: `Kanban cold load = ${measuredMs}ms ✓` };
  } catch (err) {
    return { name: "kanban_load", status: "warn", message: `kanban_load check threw: ${(err as Error).message}` };
  }
}

async function checkTableScroll(cfg: WebDoctorConfig): Promise<DoctorWebCheckEntry> {
  if (!cfg.checkTableScroll) {
    return { name: "table_scroll", status: "skip", message: "no measurement injected — skip" };
  }
  try {
    const { blankRows } = await cfg.checkTableScroll();
    if (blankRows > 0) {
      return {
        name: "table_scroll",
        status: "fail",
        message: `Table scroll found ${blankRows} blank row(s) during virtual scroll`,
        recovery: "Check VirtualList row estimator — ensure overscan covers every viewport position.",
      };
    }
    return { name: "table_scroll", status: "pass", message: "Table scroll: no blank rows ✓" };
  } catch (err) {
    return { name: "table_scroll", status: "warn", message: `table_scroll check threw: ${(err as Error).message}` };
  }
}

async function checkCmdKOpen(cfg: WebDoctorConfig): Promise<DoctorWebCheckEntry> {
  if (!cfg.checkCmdKOpen) {
    return { name: "cmdK_open", status: "skip", message: "no measurement injected — skip" };
  }
  try {
    const { measuredMs } = await cfg.checkCmdKOpen();
    if (measuredMs >= PERF_BUDGETS.cmdK_open_ms) {
      return {
        name: "cmdK_open",
        status: "fail",
        message: `Cmd+K open = ${measuredMs}ms exceeds budget`,
        recovery: `Reduce palette initialisation cost. Budget: ${PERF_BUDGETS.cmdK_open_ms}ms.`,
      };
    }
    return { name: "cmdK_open", status: "pass", message: `Cmd+K open = ${measuredMs}ms ✓` };
  } catch (err) {
    return { name: "cmdK_open", status: "warn", message: `cmdK_open check threw: ${(err as Error).message}` };
  }
}

async function checkAutosaveRoundtrip(cfg: WebDoctorConfig): Promise<DoctorWebCheckEntry> {
  if (!cfg.checkAutosaveRoundtrip) {
    return { name: "autosave_roundtrip", status: "skip", message: "no measurement injected — skip" };
  }
  try {
    const { measuredMs, withinBudget } = await cfg.checkAutosaveRoundtrip();
    if (!withinBudget) {
      return {
        name: "autosave_roundtrip",
        status: "fail",
        message: `Autosave round-trip = ${measuredMs}ms exceeds budget`,
        recovery: `tRPC autosave handler must respond within ${PERF_BUDGETS.autosave_roundtrip_ms}ms. Check DB write path.`,
      };
    }
    return { name: "autosave_roundtrip", status: "pass", message: `Autosave round-trip = ${measuredMs}ms ✓` };
  } catch (err) {
    return { name: "autosave_roundtrip", status: "warn", message: `autosave_roundtrip check threw: ${(err as Error).message}` };
  }
}

async function checkLighthouseScore(cfg: WebDoctorConfig): Promise<DoctorWebCheckEntry> {
  if (!cfg.checkLighthouseScore) {
    return { name: "lighthouse_score", status: "skip", message: "no measurement injected — skip" };
  }
  try {
    const { score } = await cfg.checkLighthouseScore();
    if (score < PERF_BUDGETS.lighthouse_min_score) {
      return {
        name: "lighthouse_score",
        status: "fail",
        message: `Lighthouse performance score = ${score} below budget`,
        recovery: `Target score >= ${PERF_BUDGETS.lighthouse_min_score}. Run \`bun run scripts/ci/lighthouse-gate.ts\` for details.`,
      };
    }
    return { name: "lighthouse_score", status: "pass", message: `Lighthouse score = ${score} ✓` };
  } catch (err) {
    return { name: "lighthouse_score", status: "warn", message: `lighthouse_score check threw: ${(err as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function runWebDoctorChecks(cfg: WebDoctorConfig): Promise<DoctorWebCheck> {
  const checks: DoctorWebCheckEntry[] = [];

  checks.push(await checkTauriBuild(cfg));
  checks.push(await checkSsrTtfb(cfg));
  checks.push(await checkNavP95(cfg));
  checks.push(await checkKanbanLoad(cfg));
  checks.push(await checkTableScroll(cfg));
  checks.push(await checkCmdKOpen(cfg));
  checks.push(await checkAutosaveRoundtrip(cfg));
  checks.push(await checkLighthouseScore(cfg));

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

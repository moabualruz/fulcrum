/**
 * TUI Doctor screen — renders TUI subsystem health checks.
 * Slice 15 of Pillar 15 (Issue 18: doctor integration + OpenTUI gate).
 *
 * Pure presenter: no terminal I/O. Consumed by OpenTUI component tree and tests.
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { DoctorCheckResult } from "@platform-core/application/health-checks/types.ts";

// ---------------------------------------------------------------------------
// TuiDoctorCheck Zod shape (re-exported for CLI / web consumers)
// ---------------------------------------------------------------------------

export { DoctorCheckResultSchema as TuiDoctorCheckSchema } from "@platform-core/application/health-checks/types.ts";
export type { DoctorCheckResult as TuiDoctorCheck } from "@platform-core/application/health-checks/types.ts";

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

function statusBadge(status: DoctorCheckResult["status"]): string {
  switch (status) {
    case "ok":   return c.green(" OK  ");
    case "warn": return c.yellow("WARN ");
    case "fail": return c.red(" FAIL");
    default:     return "     ";
  }
}

function statusIcon(status: DoctorCheckResult["status"]): string {
  switch (status) {
    case "ok":   return c.green("✓");
    case "warn": return c.yellow("⚠");
    case "fail": return c.red("✗");
    default:     return " ";
  }
}

// ---------------------------------------------------------------------------
// DoctorScreen — loads and renders TUI subsystem checks
// ---------------------------------------------------------------------------

export interface DoctorScreenOptions {
  /** Pre-loaded check results (passed in by caller after running doctor). */
  results?: DoctorCheckResult[];
  /** Called when user presses Escape / q. */
  onExit?: () => void;
  /** Subsystem filter shown in header; defaults to "tui". */
  subsystem?: string;
}

export class DoctorScreen {
  private results: DoctorCheckResult[];
  private cursor = 0;
  private expanded = new Set<string>();
  private readonly subsystem: string;

  constructor(private readonly opts: DoctorScreenOptions = {}) {
    this.results = opts.results ?? [];
    this.subsystem = opts.subsystem ?? "tui";
  }

  /** Replace the check results (called after async doctor run completes). */
  setResults(results: DoctorCheckResult[]): void {
    this.results = results;
    this.cursor = Math.min(this.cursor, Math.max(0, results.length - 1));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "\x1b" || key === "q") {
      this.opts.onExit?.();
      return true;
    }
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.results.length - 1));
      return true;
    }
    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(this.cursor - 1, 0);
      return true;
    }
    if (key === "\r" || key === " ") {
      const item = this.results[this.cursor];
      if (item) {
        const key = item.name;
        if (this.expanded.has(key)) {
          this.expanded.delete(key);
        } else {
          this.expanded.add(key);
        }
      }
      return true;
    }
    return false;
  }

  render(renderer: Renderer): void {
    renderer.header(`  Doctor — ${this.subsystem} subsystem`);
    renderer.writeln();

    if (this.results.length === 0) {
      renderer.writeln(c.dim("  Running checks…"));
      renderer.writeln();
      renderer.statusBar("[q] Back", "");
      return;
    }

    // Summary row
    const ok   = this.results.filter((r) => r.status === "ok").length;
    const warn = this.results.filter((r) => r.status === "warn").length;
    const fail = this.results.filter((r) => r.status === "fail").length;
    renderer.writeln(
      `  ${c.green(`${ok} ok`)}  ${c.yellow(`${warn} warn`)}  ${c.red(`${fail} fail`)}` +
      `  ${c.dim(`(${this.results.length} checks)`)}`,
    );
    renderer.separator();

    // Check rows
    for (let i = 0; i < this.results.length; i++) {
      const r = this.results[i]!;
      const selected = i === this.cursor;
      const icon = statusIcon(r.status);
      const badge = statusBadge(r.status);
      const name = r.name.replace(`${this.subsystem}.`, "");
      const dur = c.dim(`${r.durationMs}ms`);

      const line = `  ${icon}  [${badge}]  ${name.padEnd(30)}  ${r.message}  ${dur}`;
      renderer.writeln(selected ? c.inverse(line) : line);

      // Expanded: show recovery guidance
      if (this.expanded.has(r.name) && r.recovery) {
        renderer.writeln(c.dim(`         Recovery: ${r.recovery}`));
      }
    }

    renderer.separator();
    renderer.statusBar("[j/k] Navigate  [Enter] Expand  [q] Back", `${this.subsystem}`);
  }
}

// ---------------------------------------------------------------------------
// OpenTUI gate — FakeTTY snapshot suite failure counter
// ---------------------------------------------------------------------------

export interface OpenTuiGateResult {
  /** Number of screens whose snapshot failed due to OpenTUI API breakage. */
  failedSnapshots: number;
  /** True when failedSnapshots > OPENTUI_GATE_THRESHOLD (10). */
  gateFailed: boolean;
  /** CI exit message including ratatui migration instructions path. */
  message: string;
}

/** Threshold: >10 snapshot failures → CI gate fails (T15-75). */
export const OPENTUI_GATE_THRESHOLD = 10;

/**
 * Evaluate OpenTUI gate given snapshot results from FakeTTY suite.
 *
 * @param failedSnapshots - count of screens that failed snapshot due to OpenTUI API breakage
 * @returns OpenTuiGateResult with gateFailed flag and CI message
 */
export function evaluateOpenTuiGate(failedSnapshots: number): OpenTuiGateResult {
  const gateFailed = failedSnapshots > OPENTUI_GATE_THRESHOLD;
  const message = gateFailed
    ? [
        `OpenTUI gate FAILED: ${failedSnapshots} screen snapshots broken (threshold: ${OPENTUI_GATE_THRESHOLD}).`,
        "OpenTUI API may have a breaking change. Migration instructions: HANDOVER.md § Ratatui Migration.",
        "To migrate: see HANDOVER.md for ratatui migration script and step-by-step guide.",
      ].join(" ")
    : `OpenTUI gate passed: ${failedSnapshots} failed snapshots (threshold: ${OPENTUI_GATE_THRESHOLD}).`;

  return { failedSnapshots, gateFailed, message };
}

/**
 * Run the OpenTUI FakeTTY snapshot gate check.
 * Counts snapshot failures across provided screen render functions.
 *
 * @param screens - array of { name, render } entries
 * @param snapshots - map of screen name → expected plain-text snapshot
 * @returns OpenTuiGateResult
 */
export function runOpenTuiSnapshotGate(
  screens: Array<{ name: string; render: () => string }>,
  snapshots: Record<string, string>,
): OpenTuiGateResult {
  let failedSnapshots = 0;

  for (const screen of screens) {
    const expected = snapshots[screen.name];
    if (expected === undefined) continue; // no baseline — skip
    try {
      const actual = screen.render();
      if (actual !== expected) {
        failedSnapshots++;
      }
    } catch {
      failedSnapshots++;
    }
  }

  return evaluateOpenTuiGate(failedSnapshots);
}

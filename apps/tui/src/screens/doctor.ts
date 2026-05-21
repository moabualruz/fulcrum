/**
 * Operate stage workbench: the TUI `:doctor` workbench (DESIGN.md §3.1,
 * CLI-TUI-UX.md §6, IA-MAP.md §9; OD `tui-runs.html` `operate` screen).
 *
 * The Operate stage's subsystem-health surface, re-homed under the shared
 * `StageWorkbench` shell so it carries the same `fulcrum · :doctor · …`
 * header, StatusFooter strip, and empty/error contract as every other stage.
 *
 * Pure presenter: no terminal I/O beyond the injected `Renderer`. Consumed by
 * the OpenTUI component tree and the doctor-screen tests.
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { DoctorCheckResult } from "@platform-core/interface/doctor-results.ts";
import { truncateWide } from "../utils/truncate.ts";
import { ModePicker, type WorkflowMode } from "../widgets/ModePicker.ts";
import {
  renderStageWorkbenchFooter,
  renderStageWorkbenchHeader,
  renderWorkbenchEmptyState,
  type StageWorkbenchScope,
} from "./runs-screen.ts";

// ---------------------------------------------------------------------------
// TuiDoctorCheck Zod shape (re-exported for CLI / web consumers)
// ---------------------------------------------------------------------------

export { DoctorCheckResultSchema as TuiDoctorCheckSchema } from "@platform-core/interface/doctor-results.ts";
export type { DoctorCheckResult as TuiDoctorCheck } from "@platform-core/interface/doctor-results.ts";

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
// DoctorScreen: loads and renders TUI subsystem checks
// ---------------------------------------------------------------------------

export interface DoctorScreenOptions {
  /** Pre-loaded check results (passed in by caller after running doctor). */
  results?: DoctorCheckResult[];
  /** Called when user presses Escape / q. */
  onExit?: () => void;
  /** Subsystem filter shown in header; defaults to "tui". */
  subsystem?: string;
  /** Project / branch label rendered in the workbench scope chrome. */
  projectLabel?: string;
  /** Active trace id rendered in the workbench footer. */
  traceId?: string | null;
  /** Healthy/total MCP servers rendered in the workbench footer. */
  mcp?: string | null;
}

export class DoctorScreen {
  private results: DoctorCheckResult[];
  private cursor = 0;
  private expanded = new Set<string>();
  private readonly subsystem: string;
  /** The focused subsystem-row Step mode picker (✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI Assist). */
  private readonly modePicker = new ModePicker({
    stepId: "subsystem",
    onSelect: (mode) => {
      this.stepMode = mode;
    },
  });
  /** Last Step mode selected via the ModePicker row. */
  private stepMode: WorkflowMode = "manual";

  constructor(private readonly opts: DoctorScreenOptions = {}) {
    this.results = opts.results ?? [];
    this.subsystem = opts.subsystem ?? "tui";
  }

  /** The Step mode currently selected on the focused subsystem row (✋/▶/💬/⊞). */
  get currentStepMode(): WorkflowMode {
    return this.stepMode;
  }

  /** The OD stage-scope chrome for the Operate workbench. */
  private get scope(): StageWorkbenchScope {
    const fail = this.results.filter((r) => r.status === "fail").length;
    const warn = this.results.filter((r) => r.status === "warn").length;
    return {
      stage: "Operate",
      route: ":doctor",
      purpose: "subsystems",
      project: this.opts.projectLabel ?? null,
      detail: this.results.length
        ? `${this.results.length} checks · ${fail} failing · ${warn} warn`
        : "subsystems",
      agent: null,
      mcp: this.opts.mcp ?? null,
      traceId: this.opts.traceId ?? null,
    };
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
    // Step mode picker: the collision-free `m` chord (`m a/p/d/i`).
    if (this.modePicker.handleChordKey(key)) return true;
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
    renderStageWorkbenchHeader(renderer, this.scope);

    if (this.results.length === 0) {
      renderWorkbenchEmptyState(
        renderer,
        `No ${this.subsystem} subsystem checks have run yet.`,
        "Running checks…",
      );
      renderStageWorkbenchFooter(renderer, this.scope);
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

    // ModePicker row for the focused subsystem-row Step (acceptance: Step-bearing rows).
    renderer.writeln(
      truncateWide(
        `  ${c.dim("step modes")}  ${this.modePicker.render()}`,
        Math.max(20, renderer.width),
      ),
    );

    renderer.separator();
    renderer.writeln(c.dim("  j/k navigate  Enter expand  m mode  q back"));
    renderStageWorkbenchFooter(renderer, this.scope);
  }
}

// ---------------------------------------------------------------------------
// OpenTUI gate: FakeTTY snapshot suite failure counter
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
    if (expected === undefined) continue; // no baseline: skip
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

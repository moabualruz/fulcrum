/**
 * P3#20 — TUI Orchestration Pane: live runs table, state filter tabs,
 * detail overlay, keyboard actions (retry/cancel).
 *
 * Designed for 2s poll refresh via `listRuns` tRPC; columns: task title,
 * agent, symphony_state badge, attempt count, elapsed, workspace path.
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { AgentRunOrchestrationState } from "../../orchestration/states.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SymphonyRun {
  id: string;
  taskTitle: string;
  agent: string;
  symphonyState: AgentRunOrchestrationState | string;
  attemptCount: number;
  startedAt: Date;
  workspacePath: string | null;
  lastErrorKind: string | null;
  nextRetryAt: Date | null;
}

export interface OrchestratorPaneOptions {
  caller: {
    symphony: {
      listRuns: () => Promise<SymphonyRun[]>;
      retryRun: (input: { runId: string }) => Promise<{ ok: boolean }>;
      cancelRun: (input: { runId: string }) => Promise<{ ok: boolean }>;
    };
  };
  viewportRows?: number;
}

// ── Filter tabs ──────────────────────────────────────────────────────────────

type FilterTab = "all" | "running" | "queued" | "stalled" | "failed";

const FILTER_TABS: FilterTab[] = ["all", "running", "queued", "stalled", "failed"];

/** Maps tab index (1-based) to filter tab. Key "1" = All, "2" = Running, etc. */
const TAB_KEY_MAP: Record<string, FilterTab> = {
  "1": "all",
  "2": "running",
  "3": "queued",
  "4": "stalled",
  "5": "failed",
};

const TAB_STATES: Record<FilterTab, AgentRunOrchestrationState[] | null> = {
  all: null,
  running: ["running", "claimed"],
  queued: ["unclaimed", "retry_queued"],
  stalled: ["stalled"],
  failed: ["failed", "timed_out"],
};

// ── Pane ─────────────────────────────────────────────────────────────────────

type Overlay = "none" | "detail";

export class OrchestratorPane {
  private runs: SymphonyRun[] = [];
  private cursor = 0;
  private scrollTop = 0;
  private activeTab: FilterTab = "all";
  private overlay: Overlay = "none";

  constructor(private readonly opts: OrchestratorPaneOptions) {}

  async load(): Promise<void> {
    this.runs = await this.opts.caller.symphony.listRuns();
    this.clampCursor();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Orchestration Pane"));
    renderer.separator();

    // Tab bar
    const tabLine = FILTER_TABS.map((tab, i) => {
      const label = `${i + 1}:${tab.charAt(0).toUpperCase() + tab.slice(1)}`;
      return tab === this.activeTab ? c.bold(`[${label}]`) : c.dim(label);
    }).join("  ");
    renderer.writeln(`  ${tabLine}`);
    renderer.writeln();

    const filtered = this.filteredRuns;

    if (this.overlay === "detail") {
      this.renderDetail(renderer);
      return;
    }

    if (filtered.length === 0) {
      renderer.writeln(c.dim("  No symphony runs."));
    } else {
      const visible = this.visibleSlice(filtered);
      for (const run of visible) {
        const index = filtered.indexOf(run);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        const elapsed = elapsedStr(run.startedAt);
        const wsPath = truncatePath(run.workspacePath, 30);
        renderer.writeln(
          `${pointer} ${stateBadge(run.symphonyState)}  ${run.agent}  ${run.taskTitle}  ${run.attemptCount}  ${elapsed}  ${wsPath}`,
        );
      }
    }

    renderer.writeln();
    renderer.writeln(
      c.dim("  j/k navigate  Enter detail  r retry  x cancel  l logs  a artifacts  1-5 tabs  q back"),
    );
  }

  async handleKey(key: string): Promise<boolean> {
    // Tab switching
    if (key in TAB_KEY_MAP) {
      this.activeTab = TAB_KEY_MAP[key]!;
      this.cursor = 0;
      this.scrollTop = 0;
      return true;
    }

    // Overlay: Esc closes
    if (key === "\x1b" && this.overlay === "detail") {
      this.overlay = "none";
      return true;
    }

    // Navigation
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.filteredRuns.length - 1));
      this.keepCursorVisible();
      return true;
    }
    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      this.keepCursorVisible();
      return true;
    }

    // Enter → detail overlay
    if (key === "\r") {
      const run = this.selectedRun;
      if (run) this.overlay = "detail";
      return true;
    }

    // r → retry
    if (key === "r") {
      const run = this.selectedRun;
      if (run) {
        await this.opts.caller.symphony.retryRun({ runId: run.id });
      }
      return true;
    }

    // x → cancel
    if (key === "x") {
      const run = this.selectedRun;
      if (run) {
        await this.opts.caller.symphony.cancelRun({ runId: run.id });
      }
      return true;
    }

    return false;
  }

  dispose(): void {
    // No subscriptions to clean up (poll-based)
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private get filteredRuns(): SymphonyRun[] {
    const states = TAB_STATES[this.activeTab];
    if (!states) return this.runs;
    return this.runs.filter((r) => states.includes(r.symphonyState as AgentRunOrchestrationState));
  }

  private get selectedRun(): SymphonyRun | undefined {
    return this.filteredRuns[this.cursor];
  }

  private visibleSlice(filtered: SymphonyRun[]): SymphonyRun[] {
    const rows = this.opts.viewportRows ?? 20;
    return filtered.slice(this.scrollTop, this.scrollTop + rows);
  }

  private renderDetail(renderer: Renderer): void {
    const run = this.selectedRun;
    if (!run) {
      renderer.writeln(c.dim("  No run selected."));
      return;
    }

    renderer.writeln(c.bold(`  Run Detail › ${run.id}`));
    renderer.writeln();
    renderer.writeln(`  Task:            ${run.taskTitle}`);
    renderer.writeln(`  Agent:           ${run.agent}`);
    renderer.writeln(`  State:           ${stateBadge(run.symphonyState)}`);
    renderer.writeln(`  Attempts:        ${run.attemptCount}`);
    renderer.writeln(`  Started:         ${run.startedAt.toISOString()}`);
    renderer.writeln(`  Workspace:       ${run.workspacePath ?? "—"}`);
    renderer.writeln(`  last_error_kind: ${run.lastErrorKind ?? "—"}`);
    renderer.writeln(`  next_retry_at:   ${run.nextRetryAt?.toISOString() ?? "—"}`);
    renderer.writeln();
    renderer.writeln(c.dim("  r retry  x cancel  Esc close"));
  }

  private clampCursor(): void {
    const max = Math.max(0, this.filteredRuns.length - 1);
    this.cursor = Math.min(this.cursor, max);
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 20;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stateBadge(state: string): string {
  if (state === "running" || state === "claimed") return c.yellow(`[${state}]`);
  if (state === "succeeded" || state === "completed") return c.green(`[${state}]`);
  if (state === "retry_queued" || state === "unclaimed") return c.cyan(`[${state}]`);
  if (state === "failed" || state === "timed_out" || state === "stalled") return c.red(`[${state}]`);
  if (state === "cancelled" || state === "released") return c.dim(`[${state}]`);
  return `[${state}]`;
}

function elapsedStr(startedAt: Date): string {
  const ms = Date.now() - startedAt.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

function truncatePath(path: string | null, maxLen: number): string {
  if (!path) return "—";
  if (path.length <= maxLen) return path;
  return "…" + path.slice(-(maxLen - 1));
}

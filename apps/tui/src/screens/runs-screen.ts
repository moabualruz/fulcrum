/**
 * RunsScreen — TUI run controls (W8).
 *
 * Extended runs screen with dependency tree preview, dispatch, cancel, and
 * retry actions. Complements the existing runs.ts list/detail screens by
 * adding run lifecycle management.
 *
 * Keybindings:
 *   D       — dispatch new run
 *   C       — cancel selected run
 *   R       — retry failed run
 *   P       — preview dependency tree
 *   j/k     — navigate
 *   Enter   — open run detail
 *   q       — go back
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TuiRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface TuiRunDep {
  runId: string;
  label: string;
  status: TuiRunStatus | string;
}

export interface TuiManagedRun {
  id: string;
  agent: string;
  status: TuiRunStatus | string;
  taskTitle?: string | null;
  projectName?: string | null;
  startedAt?: string | Date | null;
  deps?: TuiRunDep[];
}

export interface RunsControlScreenOptions {
  projectId?: string;
  caller: {
    agent_runs: {
      list: (input?: { projectId?: string }) => Promise<TuiManagedRun[]>;
      dispatch: (input: { projectId: string; taskId: string; agent: string }) => Promise<TuiManagedRun>;
      cancel: (input: { id: string }) => Promise<{ ok: boolean }>;
      retry: (input: { id: string }) => Promise<TuiManagedRun>;
      getDeps: (input: { id: string }) => Promise<TuiRunDep[]>;
    };
  };
  onOpenRun?: (id: string) => void;
  viewportRows?: number;
}

type RunsOverlay = "none" | "dispatch" | "deps";

// ─────────────────────────────────────────────────────────────────────────────
// RunsControlScreen
// ─────────────────────────────────────────────────────────────────────────────

export class RunsControlScreen {
  private runs: TuiManagedRun[] = [];
  private cursor = 0;
  private scrollTop = 0;
  private overlay: RunsOverlay = "none";
  private deps: TuiRunDep[] = [];
  private error: string | null = null;

  constructor(private readonly opts: RunsControlScreenOptions) {}

  async load(): Promise<void> {
    try {
      this.runs = await this.opts.caller.agent_runs.list(
        this.opts.projectId ? { projectId: this.opts.projectId } : undefined,
      );
      this.error = null;
      this.clampCursor();
    } catch (err) {
      this.runs = [];
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Runs"));
    renderer.separator();
    renderer.writeln();

    if (this.error) {
      renderer.writeln(c.red(`  ${this.error}`));
      renderer.writeln();
    }

    // Status summary
    const counts = statusCounts(this.runs);
    renderer.writeln(
      `  ${c.dim("pending:")}${counts.pending}  ${c.yellow("running:")}${counts.running}  ${c.green("completed:")}${counts.completed}  ${c.red("failed:")}${counts.failed}`,
    );
    renderer.writeln();

    // Run list
    if (this.runs.length === 0) {
      renderer.writeln(c.dim("  No runs."));
    } else {
      const visible = this.visibleRuns;
      for (const run of visible) {
        const index = this.runs.indexOf(run);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        const badge = runStatusBadge(run.status);
        const project = run.projectName ?? "no project";
        const task = run.taskTitle ?? run.id;
        renderer.writeln(`${pointer} ${badge} ${run.agent}  ${project}  ${task}  ${c.dim(run.id)}`);
      }
    }

    // Dispatch overlay
    if (this.overlay === "dispatch") {
      renderer.writeln();
      renderer.writeln(c.bold("  Dispatch run"));
      renderer.writeln(c.dim("  Use submitDispatch(projectId, taskId, agent) to dispatch."));
    }

    // Dependency tree overlay
    if (this.overlay === "deps") {
      renderer.writeln();
      const run = this.runs[this.cursor];
      renderer.writeln(c.bold(`  Dependencies for ${run?.id ?? "(none)"}`));
      if (this.deps.length === 0) {
        renderer.writeln(c.dim("  No dependencies."));
      } else {
        for (const dep of this.deps) {
          const depBadge = runStatusBadge(dep.status);
          renderer.writeln(`  ${depBadge} ${dep.label}  ${c.dim(dep.runId)}`);
        }
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  D=dispatch  C=cancel  R=retry  P=preview deps  j/k=navigate  Enter=detail  q=back"));
  }

  async handleKey(key: string): Promise<boolean> {
    // Close overlay on Escape
    if (key === "\x1b" && this.overlay !== "none") {
      this.overlay = "none";
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.runs.length - 1));
      this.keepCursorVisible();
      if (this.overlay === "deps") this.overlay = "none";
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      this.keepCursorVisible();
      if (this.overlay === "deps") this.overlay = "none";
      return true;
    }

    if (key === "D" || key === "d") {
      this.overlay = "dispatch";
      return true;
    }

    if (key === "C" || key === "c") {
      const run = this.runs[this.cursor];
      if (!run) return false;
      try {
        await this.opts.caller.agent_runs.cancel({ id: run.id });
        run.status = "cancelled";
        this.error = null;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
      return true;
    }

    if (key === "R" || key === "r") {
      const run = this.runs[this.cursor];
      if (!run) return false;
      try {
        const retried = await this.opts.caller.agent_runs.retry({ id: run.id });
        // Replace the failed run in-place with the retried version
        const idx = this.runs.findIndex((r) => r.id === run.id);
        if (idx >= 0) this.runs[idx] = retried;
        this.error = null;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
      return true;
    }

    if (key === "P" || key === "p") {
      const run = this.runs[this.cursor];
      if (!run) return false;
      try {
        this.deps = await this.opts.caller.agent_runs.getDeps({ id: run.id });
        this.overlay = "deps";
        this.error = null;
      } catch (err) {
        this.deps = [];
        this.error = err instanceof Error ? err.message : String(err);
      }
      return true;
    }

    if (key === "\r" || key === "\n") {
      const run = this.runs[this.cursor];
      if (!run) return false;
      this.opts.onOpenRun?.(run.id);
      return true;
    }

    return false;
  }

  /** Dispatch a new run and prepend to the list. */
  async submitDispatch(input: { projectId: string; taskId: string; agent: string }): Promise<void> {
    try {
      const run = await this.opts.caller.agent_runs.dispatch(input);
      this.runs = [run, ...this.runs];
      this.cursor = 0;
      this.scrollTop = 0;
      this.overlay = "none";
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  get visibleRuns(): readonly TuiManagedRun[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.runs.slice(this.scrollTop, this.scrollTop + rows);
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.runs.length - 1));
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 20;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function runStatusBadge(status: string): string {
  const normalized = status === "succeeded" ? "completed" : status;
  if (normalized === "running") return c.yellow("[running]");
  if (normalized === "completed") return c.green("[completed]");
  if (normalized === "failed") return c.red("[failed]");
  if (normalized === "pending") return c.dim("[pending]");
  if (normalized === "cancelled") return c.dim("[cancelled]");
  return `[${normalized}]`;
}

function statusCounts(runs: TuiManagedRun[]): Record<string, number> {
  const counts: Record<string, number> = { pending: 0, running: 0, completed: 0, failed: 0 };
  for (const run of runs) {
    const s = run.status === "succeeded" ? "completed" : run.status;
    if (s in counts) counts[s]!++;
  }
  return counts;
}

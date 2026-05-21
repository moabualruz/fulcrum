import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { TuiSubscription, SubscriptionBridge } from "../subscriptions.ts";
import {
  renderStatusBadge,
  renderWorkbenchEmptyState,
  renderWorkbenchErrorFrame,
  resolveStatusBadgeState,
} from "./runs-screen.ts";

export interface TuiRun {
  id: string;
  agent: string;
  status: string;
  taskTitle?: string | null;
  projectName?: string | null;
  startedAt?: string | Date | null;
  logLines?: string[];
  observability?: TuiRunObservability;
}

export interface TuiRunObservability {
  context?: { sourceRefs?: Array<{ kind?: string; id?: string; reason?: string; scope?: string }> };
  artifacts?: Array<{ filename?: string; title?: string; lifecycleState?: string }>;
  memoryCandidates?: Array<{ key?: string; title?: string } | Record<string, unknown>>;
  followUpTasks?: Array<{ title?: string; id?: string } | Record<string, unknown>>;
  audit?: Array<{ verb?: string; actor?: string } | Record<string, unknown>>;
  recovery?: { retryable?: boolean; retryCount?: number; lastErrorKind?: string | null; nextRetryAt?: string | Date | null };
}

export interface RunsScreenOptions {
  /** Active trace id rendered into the error frame (CLI-TUI-UX.md §5). */
  traceId?: string | null;
  caller: {
    agent_runs: {
      list: () => Promise<TuiRun[]>;
      create: (input: { projectId: string; taskId: string; agent: string }) => Promise<TuiRun>;
    };
  };
  onOpenRun?: (id: string) => void;
  viewportRows?: number;
}

type RunsOverlay = "none" | "dispatch";

export class RunsScreen {
  private runs: TuiRun[] = [];
  private cursor = 0;
  private scrollTop = 0;
  private overlay: RunsOverlay = "none";
  private error: string | null = null;

  constructor(private readonly opts: RunsScreenOptions) {}

  async load(): Promise<void> {
    try {
      this.runs = await this.opts.caller.agent_runs.list();
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

    // Error frame: `[what failed]. [why]. [next step]. trace=<id>` (CLI-TUI-UX.md §5).
    if (this.error) {
      renderWorkbenchErrorFrame(renderer, {
        what: "Runs feed failed to load.",
        next: this.error,
        traceId: this.opts.traceId,
      });
      return;
    }

    renderer.writeln();

    // Empty state: one sentence + one action (CLI-TUI-UX.md §5, COPY.md §2).
    if (this.visibleRuns.length === 0) {
      renderWorkbenchEmptyState(
        renderer,
        "No runs yet in this project.",
        "Press d to dispatch the first run.",
      );
    } else {
      for (const run of this.visibleRuns) {
        const index = this.runs.indexOf(run);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        renderer.writeln(`${pointer} ${renderStatusBadge(run.status)} ${run.agent}  ${run.projectName ?? "no project"}  ${run.taskTitle ?? run.id}  ${run.id}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  j/k navigate  Enter detail  d dispatch  q back"));

    if (this.overlay === "dispatch") {
      renderer.writeln();
      renderer.writeln(c.bold("  Dispatch run"));
      renderer.writeln(c.dim("  project + task selectors"));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.runs.length - 1));
      this.keepCursorVisible();
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      this.keepCursorVisible();
      return true;
    }

    if (key === "d") {
      this.overlay = "dispatch";
      return true;
    }

    if (key === "\r") {
      const run = this.runs[this.cursor];
      if (!run) return false;
      this.opts.onOpenRun?.(run.id);
      return true;
    }

    return false;
  }

  async submitDispatch(input: { projectId: string; taskId: string; agent: string }): Promise<void> {
    const run = await this.opts.caller.agent_runs.create(input);
    this.runs = [run, ...this.runs];
    this.cursor = 0;
    this.scrollTop = 0;
    this.overlay = "none";
  }

  get visibleRuns(): readonly TuiRun[] {
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

export interface RunDetailScreenOptions {
  runId: string;
  caller: {
    agent_runs: {
      get: (input: { id: string }) => Promise<TuiRun>;
      cancel: (input: { id: string }) => Promise<{ ok: boolean }>;
    };
  };
  /** caller subscription path: TuiCaller.runsSubscriptions -> EventBus-backed runsSubscriptions. */
  subscriptions?: SubscriptionBridge;
}

export interface RunUpdatePayload {
  id: string;
  status?: string;
  logLine?: string;
}

export class RunDetailScreen {
  private run: TuiRun | null = null;
  private logLines: string[] = [];
  private subscriptions: TuiSubscription[] = [];

  constructor(private readonly opts: RunDetailScreenOptions) {}

  async load(): Promise<void> {
    this.run = await this.opts.caller.agent_runs.get({ id: this.opts.runId });
    this.logLines = [...(this.run.logLines ?? [])];
    this.subscribeOnce();
  }

  get currentRun(): TuiRun | null {
    return this.run;
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold(`  Run › ${this.run?.id ?? this.opts.runId}`));
    renderer.separator();
    renderer.writeln();

    if (!this.run) {
      renderer.writeln(c.dim("  Loading run."));
      return;
    }

    renderer.writeln(`  ${renderStatusBadge(this.run.status)} agent:${this.run.agent}  ${this.run.projectName ?? "no project"}  ${this.run.taskTitle ?? ""}`);
    if (resolveStatusBadgeState(this.run.status) === "complete") {
      renderer.writeln();
      renderer.writeln(c.green("  Run completed"));
    }

    renderer.writeln();
    renderer.writeln(c.bold("  Transcript / log"));
    for (const line of this.logLines) renderer.writeln(`  ${line}`);
    this.renderObservability(renderer, this.run.observability);
    renderer.writeln();
    renderer.writeln(c.dim("  x cancel  q back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key !== "x" || !this.run) return false;
    await this.opts.caller.agent_runs.cancel({ id: this.run.id });
    this.run = { ...this.run, status: "cancelled" };
    return true;
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    this.subscriptions = [];
  }

  private subscribeOnce(): void {
    if (!this.opts.subscriptions || this.subscriptions.length > 0) return;
    this.subscriptions.push(
      this.opts.subscriptions.subscribe<RunUpdatePayload>("runs.onRunUpdate", (payload) => {
        if (!this.run || payload.id !== this.run.id) return;
        this.run = { ...this.run, status: payload.status ?? this.run.status };
        if (payload.logLine) this.logLines.push(payload.logLine);
      }),
    );
  }

  private renderObservability(renderer: Renderer, observability: TuiRunObservability | undefined): void {
    if (!observability) return;
    renderer.writeln();
    renderer.writeln(c.bold("  Context"));
    for (const ref of observability.context?.sourceRefs ?? []) {
      renderer.writeln(`  ${ref.kind ?? "ref"}:${ref.id ?? ""}  ${ref.reason ?? ""}`);
    }
    renderer.writeln();
    renderer.writeln(c.bold("  Artifacts"));
    for (const artifact of observability.artifacts ?? []) {
      renderer.writeln(`  ${artifact.filename ?? artifact.title ?? "artifact"}  ${artifact.lifecycleState ?? ""}`);
    }
    renderer.writeln();
    renderer.writeln(c.bold("  Memory"));
    for (const candidate of observability.memoryCandidates ?? []) {
      renderer.writeln(`  ${String(candidate["key"] ?? candidate["title"] ?? "candidate")}`);
    }
    renderer.writeln();
    renderer.writeln(c.bold("  Follow-ups"));
    for (const task of observability.followUpTasks ?? []) {
      renderer.writeln(`  ${String(task["title"] ?? task["id"] ?? "task")}`);
    }
    renderer.writeln();
    renderer.writeln(c.bold("  Audit"));
    for (const event of observability.audit ?? []) {
      renderer.writeln(`  ${String(event["verb"] ?? "event")}  ${String(event["actor"] ?? "")}`);
    }
    renderer.writeln();
    renderer.writeln(c.bold("  Recovery"));
    const recovery = observability.recovery;
    if (recovery) {
      renderer.writeln(
        `  retryable:${String(recovery.retryable ?? false)} attempt:${String(recovery.retryCount ?? 0)} ${recovery.lastErrorKind ?? ""}`,
      );
    }
  }
}


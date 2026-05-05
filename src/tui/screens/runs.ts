import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { TuiSubscription, SubscriptionBridge } from "../subscriptions.ts";

export interface TuiRun {
  id: string;
  agent: string;
  status: string;
  taskTitle?: string | null;
  projectName?: string | null;
  startedAt?: string | Date | null;
  logLines?: string[];
}

export interface RunsScreenOptions {
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

  constructor(private readonly opts: RunsScreenOptions) {}

  async load(): Promise<void> {
    this.runs = await this.opts.caller.agent_runs.list();
    this.clampCursor();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Runs"));
    renderer.separator();
    renderer.writeln();

    if (this.visibleRuns.length === 0) {
      renderer.writeln(c.dim("  No runs."));
    } else {
      for (const run of this.visibleRuns) {
        const index = this.runs.indexOf(run);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        renderer.writeln(`${pointer} ${statusBadge(run.status)} ${run.agent}  ${run.projectName ?? "no project"}  ${run.taskTitle ?? run.id}  ${run.id}`);
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

    renderer.writeln(`  ${statusBadge(this.run.status)} agent:${this.run.agent}  ${this.run.projectName ?? "no project"}  ${this.run.taskTitle ?? ""}`);
    if (isCompletedStatus(this.run.status)) {
      renderer.writeln();
      renderer.writeln(c.green("  Run completed"));
    }

    renderer.writeln();
    renderer.writeln(c.bold("  Transcript / log"));
    for (const line of this.logLines) renderer.writeln(`  ${line}`);
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
}

function statusBadge(status: string): string {
  const normalized = status === "succeeded" ? "completed" : status;
  if (normalized === "running") return c.yellow("[running]");
  if (normalized === "completed") return c.green("[completed]");
  if (normalized === "failed") return c.red("[failed]");
  if (normalized === "cancelled") return c.dim("[cancelled]");
  return `[${normalized}]`;
}

function isCompletedStatus(status: string): boolean {
  return status === "completed" || status === "succeeded";
}

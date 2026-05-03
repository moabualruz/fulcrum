import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { SubscriptionBridge, TuiSubscription } from "../subscriptions.ts";

export interface TuiOrchestrationRun {
  id: string;
  agent: string;
  claimState: string;
  taskTitle?: string | null;
  projectName?: string | null;
}

export interface TuiOrchestratorStatus {
  status: string;
  leaderId?: string | null;
}

export interface OrchestrationScreenOptions {
  caller: {
    orchestration: {
      status: () => Promise<TuiOrchestratorStatus>;
      list: () => Promise<TuiOrchestrationRun[]>;
    };
  };
  subscriptions?: SubscriptionBridge;
  viewportRows?: number;
}

export interface OrchestrationStateChangePayload {
  id: string;
  claimState: string;
}

export class OrchestrationScreen {
  private status: TuiOrchestratorStatus | null = null;
  private runs: TuiOrchestrationRun[] = [];
  private subscriptions: TuiSubscription[] = [];

  constructor(private readonly opts: OrchestrationScreenOptions) {}

  async load(): Promise<void> {
    const [status, runs] = await Promise.all([
      this.opts.caller.orchestration.status(),
      this.opts.caller.orchestration.list(),
    ]);
    this.status = status;
    this.runs = runs;
    this.subscribeOnce();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Orchestration"));
    renderer.separator();
    renderer.writeln();

    const status = this.status?.status ?? "unknown";
    const leader = this.status?.leaderId ? `  leader ${this.status.leaderId}` : "";
    renderer.writeln(`  Orchestrator: ${status}${leader}`);
    renderer.writeln();
    renderer.writeln(c.bold("  Live runs"));

    if (this.visibleRuns.length === 0) {
      renderer.writeln(c.dim("  No orchestration runs."));
    } else {
      for (const run of this.visibleRuns) {
        renderer.writeln(`  ${claimBadge(run.claimState)} ${run.agent}  ${run.projectName ?? "no project"}  ${run.taskTitle ?? run.id}  ${run.id}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  subscription orchestration.onStateChange  q back"));
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    this.subscriptions = [];
  }

  get visibleRuns(): readonly TuiOrchestrationRun[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.runs.slice(0, rows);
  }

  private subscribeOnce(): void {
    if (!this.opts.subscriptions || this.subscriptions.length > 0) return;
    this.subscriptions.push(
      this.opts.subscriptions.subscribe<OrchestrationStateChangePayload>("orchestration.onStateChange", (payload) => {
        this.runs = this.runs.map((run) =>
          run.id === payload.id ? { ...run, claimState: payload.claimState } : run,
        );
      }),
    );
  }
}

function claimBadge(state: string): string {
  if (state === "pending" || state === "unclaimed") return c.dim("[pending]");
  if (state === "claimed") return c.cyan("[claimed]");
  if (state === "running") return c.yellow("[running]");
  if (state === "completed" || state === "succeeded") return c.green("[completed]");
  if (state === "failed" || state === "timed_out" || state === "stalled") return c.red(`[${state}]`);
  return `[${state}]`;
}

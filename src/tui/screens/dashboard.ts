import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { TuiSubscription, SubscriptionBridge } from "../subscriptions.ts";

export interface DashboardRun {
  id: string;
  agent: string;
  status: string;
  startedAt?: string | Date | null;
}

export interface DashboardSummary {
  projectsCount: number;
  openTasksCount: number;
  runsLast7d: number;
  bellCount: number;
  recentRuns: DashboardRun[];
}

export interface DashboardScreenOptions {
  caller: {
    dashboard: {
      summary: () => Promise<DashboardSummary>;
    };
  };
  subscriptions?: SubscriptionBridge;
}

export class DashboardScreen {
  private summary: DashboardSummary = {
    projectsCount: 0,
    openTasksCount: 0,
    runsLast7d: 0,
    bellCount: 0,
    recentRuns: [],
  };
  private subscriptions: TuiSubscription[] = [];

  constructor(private readonly opts: DashboardScreenOptions) {}

  async load(): Promise<void> {
    this.summary = await this.opts.caller.dashboard.summary();
    this.subscribeOnce();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Dashboard"));
    renderer.separator();
    renderer.writeln();
    renderer.writeln(`  Projects: ${this.summary.projectsCount}`);
    renderer.writeln(`  Open tasks: ${this.summary.openTasksCount}`);
    renderer.writeln(`  Runs 7d: ${this.summary.runsLast7d}`);
    renderer.writeln(`  Bell: ${this.summary.bellCount}`);
    renderer.writeln();
    renderer.writeln(c.bold("  Recent runs"));

    if (this.summary.recentRuns.length === 0) {
      renderer.writeln(c.dim("  No recent runs."));
    } else {
      for (const run of this.summary.recentRuns.slice(0, 5)) {
        renderer.writeln(`  ${run.agent}  ${run.status}  ${run.id}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  p projects  r runs  q back"));
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    this.subscriptions = [];
  }

  private subscribeOnce(): void {
    if (!this.opts.subscriptions || this.subscriptions.length > 0) return;

    this.subscriptions.push(
      this.opts.subscriptions.subscribe<{ count: number }>("notifications.unreadCount", (payload) => {
        this.summary = { ...this.summary, bellCount: payload.count };
      }),
      this.opts.subscriptions.subscribe<DashboardRun>("runs.onRunUpdate", (run) => {
        this.summary = {
          ...this.summary,
          runsLast7d: this.summary.runsLast7d + 1,
          recentRuns: [run, ...this.summary.recentRuns].slice(0, 5),
        };
      }),
    );
  }
}

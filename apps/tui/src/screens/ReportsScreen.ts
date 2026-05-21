/**
 * ReportsScreen: TUI reports screen with ASCII charts.
 *
 * Methodology-aware tabs:
 *   scrum:  Sprint | Flow | Project | Team
 *   kanban: Flow | Project | Team
 *   none:   Project | Team
 *
 * Data fetched via tRPC caller (shared service layer: D-84).
 * Charts rendered via AsciiChart component (D-83, D-87).
 *
 * Keyboard navigation:
 *   Tab / 1-4: switch tabs
 *   j/k      : scroll within tab
 *   q        : go back
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import {
  renderBarChart,
  renderCycleTimeStats,
  renderLineChart,
  renderSparkline,
} from "../components/AsciiChart.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Methodology = "scrum" | "kanban" | "none";

interface BurndownRow { day: number; ideal: number; actual: number }
interface VelocityRow { sprint: string; points: number }
interface ThroughputRow { week: string; count: number }
interface WorkloadRow { assignee: string; taskCount: number }
interface EpicProgressRow { epicTitle: string; done: number; total: number }

interface ReportsData {
  methodology: Methodology;
  burndown: BurndownRow[];
  velocity: VelocityRow[];
  throughput: ThroughputRow[];
  cycleTime: number[];
  workload: WorkloadRow[];
  epicProgress: EpicProgressRow[];
  wip: Record<string, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => Promise<any>;

interface ReportsCaller {
  reports: {
    metrics?: AnyFn;
    burndown?: AnyFn;
    velocity?: AnyFn;
    throughput?: AnyFn;
    cycleTime?: AnyFn;
    workload?: AnyFn;
    epicProgress?: AnyFn;
    wip?: AnyFn;
  };
  workflows?: {
    getMethodology?: AnyFn;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab configuration per methodology
// ─────────────────────────────────────────────────────────────────────────────

type TabKey = "sprint" | "flow" | "project" | "team";

const METHODOLOGY_TABS: Record<Methodology, TabKey[]> = {
  scrum: ["sprint", "flow", "project", "team"],
  kanban: ["flow", "project", "team"],
  none: ["project", "team"],
};

const TAB_LABELS: Record<TabKey, string> = {
  sprint: "Sprint",
  flow: "Flow",
  project: "Project",
  team: "Team",
};

// ─────────────────────────────────────────────────────────────────────────────
// ReportsScreen
// ─────────────────────────────────────────────────────────────────────────────

export class ReportsScreen {
  private data: ReportsData | null = null;
  private selectedTabIndex = 0;
  private scrollOffset = 0;
  private projectId: string | undefined;

  constructor(
    private readonly opts: {
      caller: ReportsCaller;
      projectId?: string;
    },
  ) {
    this.projectId = opts.projectId;
  }

  async load(): Promise<void> {
    const caller = this.opts.caller;

    // Determine methodology
    let methodology: Methodology = "none";
    if (caller.workflows?.getMethodology && this.projectId) {
      try {
        const result = await caller.workflows.getMethodology({ projectId: this.projectId });
        methodology = (result.methodology as Methodology) ?? "none";
      } catch {
        methodology = "none";
      }
    }

    // Fetch report data: try unified metrics endpoint first, fall back to individual
    let burndown: BurndownRow[] = [];
    let velocity: VelocityRow[] = [];
    let throughput: ThroughputRow[] = [];
    let cycleTime: number[] = [];
    let workload: WorkloadRow[] = [];
    let epicProgress: EpicProgressRow[] = [];
    let wip: Record<string, number> = {};

    if (caller.reports.metrics) {
      try {
        const metrics = await caller.reports.metrics({ projectId: this.projectId });
        burndown = metrics.burndown ?? [];
        velocity = metrics.velocity ?? [];
        throughput = metrics.throughput ?? [];
        cycleTime = metrics.cycleTime ?? [];
        workload = metrics.workload ?? [];
        epicProgress = metrics.epicProgress ?? [];
        wip = metrics.wip ?? {};
      } catch {
        // fall through to individual fetches
      }
    } else {
      // Individual procedure fetches
      const scope = { projectId: this.projectId };
      try { burndown = await caller.reports.burndown?.(scope) ?? []; } catch { /* ok */ }
      try { velocity = await caller.reports.velocity?.(scope) ?? []; } catch { /* ok */ }
      try { throughput = await caller.reports.throughput?.(scope) ?? []; } catch { /* ok */ }
      try { cycleTime = await caller.reports.cycleTime?.(scope) ?? []; } catch { /* ok */ }
      try { workload = await caller.reports.workload?.(scope) ?? []; } catch { /* ok */ }
      try { epicProgress = await caller.reports.epicProgress?.(scope) ?? []; } catch { /* ok */ }
      try { wip = await caller.reports.wip?.(scope) ?? {}; } catch { /* ok */ }
    }

    this.data = { methodology, burndown, velocity, throughput, cycleTime, workload, epicProgress, wip };
    this.selectedTabIndex = 0;
    this.scrollOffset = 0;
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Reports"));
    renderer.separator();

    if (!this.data) {
      renderer.writeln(c.dim("  Loading..."));
      return;
    }

    const tabs = METHODOLOGY_TABS[this.data.methodology];
    const tabBar = tabs
      .map((key, i) => {
        const label = TAB_LABELS[key];
        return i === this.selectedTabIndex ? c.bold(`[${label}]`) : c.dim(label);
      })
      .join("  ");

    renderer.writeln("  " + tabBar);
    renderer.writeln(c.dim("  Tab/1-4: switch  j/k: scroll  q: back"));
    renderer.writeln();

    const activeTab = tabs[this.selectedTabIndex];
    if (!activeTab) return;

    this.renderTab(activeTab, renderer);
  }

  private renderTab(tab: TabKey, renderer: Renderer): void {
    const data = this.data!;

    switch (tab) {
      case "sprint":
        this.renderSprintTab(renderer, data);
        break;
      case "flow":
        this.renderFlowTab(renderer, data);
        break;
      case "project":
        this.renderProjectTab(renderer, data);
        break;
      case "team":
        this.renderTeamTab(renderer, data);
        break;
    }
  }

  private renderSprintTab(renderer: Renderer, data: ReportsData): void {
    renderer.writeln(c.bold("  Sprint"));
    renderer.writeln();

    // Velocity sparkline
    if (data.velocity.length > 0) {
      renderer.writeln(c.dim("  Velocity trend (last sprints):"));
      const sparkline = renderSparkline(data.velocity.map((v) => v.points));
      renderer.writeln(`  ${sparkline}`);
      const recent = data.velocity.slice(-3);
      for (const row of recent) {
        renderer.writeln(`  ${row.sprint}: ${row.points} pts`);
      }
      renderer.writeln();
    }

    // Burndown line chart
    if (data.burndown.length > 0) {
      renderer.writeln(c.dim("  Burndown (ideal vs actual):"));
      const idealSeries = data.burndown.map((r) => r.ideal);
      const actualSeries = data.burndown.map((r) => r.actual);
      const chart = renderLineChart([idealSeries, actualSeries], ["Ideal", "Actual"], { height: 8 });
      for (const line of chart.split("\n")) {
        renderer.writeln("  " + line);
      }
      renderer.writeln();
    }

    // Cycle time stats
    if (data.cycleTime.length > 0) {
      renderer.writeln(c.dim("  Cycle time:"));
      const stats = renderCycleTimeStats(data.cycleTime);
      for (const line of stats.split("\n")) {
        renderer.writeln(line);
      }
    }
  }

  private renderFlowTab(renderer: Renderer, data: ReportsData): void {
    renderer.writeln(c.bold("  Flow"));
    renderer.writeln();

    // Throughput bar chart
    if (data.throughput.length > 0) {
      renderer.writeln(c.dim("  Throughput (tasks/week):"));
      const barData = data.throughput.map((r) => ({ label: r.week, value: r.count }));
      const chart = renderBarChart(barData);
      for (const line of chart.split("\n")) {
        renderer.writeln("  " + line);
      }
      renderer.writeln();
    }

    // Active work
    if (Object.keys(data.wip).length > 0) {
      renderer.writeln(c.dim("  Active work per status:"));
      for (const [status, count] of Object.entries(data.wip)) {
        renderer.writeln(`  ${status.padEnd(16)} ${count}`);
      }
    }
  }

  private renderProjectTab(renderer: Renderer, data: ReportsData): void {
    renderer.writeln(c.bold("  Project"));
    renderer.writeln();

    if (data.epicProgress.length === 0) {
      renderer.writeln(c.dim("  No epic data available."));
      return;
    }

    renderer.writeln(c.dim("  Progress per epic:"));
    for (const epic of data.epicProgress) {
      const pct = epic.total === 0 ? 0 : Math.round((epic.done / epic.total) * 100);
      const barLen = Math.round(pct / 5); // 20 chars = 100%
      const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);
      const label = epic.epicTitle.slice(0, 20).padEnd(20);
      renderer.writeln(`  ${label} ${bar} ${pct}% (${epic.done}/${epic.total})`);
    }
  }

  private renderTeamTab(renderer: Renderer, data: ReportsData): void {
    renderer.writeln(c.bold("  Team"));
    renderer.writeln();

    if (data.workload.length === 0) {
      renderer.writeln(c.dim("  No workload data available."));
      return;
    }

    renderer.writeln(c.dim("  Workload per assignee:"));
    const barData = data.workload.map((r) => ({ label: r.assignee, value: r.taskCount }));
    const chart = renderBarChart(barData);
    for (const line of chart.split("\n")) {
      renderer.writeln("  " + line);
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (!this.data) return false;
    const tabs = METHODOLOGY_TABS[this.data.methodology];

    // Tab key switches
    if (key === "\t") {
      this.selectedTabIndex = (this.selectedTabIndex + 1) % tabs.length;
      this.scrollOffset = 0;
      return true;
    }

    // Number keys 1-4
    const numKey = parseInt(key, 10);
    if (!isNaN(numKey) && numKey >= 1 && numKey <= tabs.length) {
      this.selectedTabIndex = numKey - 1;
      this.scrollOffset = 0;
      return true;
    }

    // Scroll
    if (key === "j") { this.scrollOffset++; return true; }
    if (key === "k") { this.scrollOffset = Math.max(0, this.scrollOffset - 1); return true; }

    // q: signal caller to pop screen
    if (key === "q") return false;

    return false;
  }
}

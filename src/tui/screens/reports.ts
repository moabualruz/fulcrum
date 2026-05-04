import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

interface Metrics {
  burndown: Array<{ day: number; ideal: number; actual: number }>;
  velocity: Array<{ sprint: string; points: number }>;
  cycleTime: number[];
  throughput: number[];
  wip: Record<string, number>;
  cfd: Array<Record<string, number | string>>;
}

type ReportKey = "burndown" | "velocity" | "cycle" | "throughput" | "wip" | "cfd";

const REPORT_KEYS: Record<string, ReportKey> = {
  "1": "burndown",
  "2": "velocity",
  "3": "cycle",
  "4": "throughput",
  "5": "wip",
  "6": "cfd",
};

export class ReportsScreen {
  private metrics: Metrics | null = null;
  private selected: ReportKey = "burndown";

  constructor(
    private readonly opts: {
      caller: {
        reports: {
          metrics: () => Promise<Metrics>;
        };
      };
    },
  ) {}

  async load(): Promise<void> {
    this.metrics = await this.opts.caller.reports.metrics();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Reports"));
    renderer.separator();
    renderer.writeln(c.dim("  1 Burndown  2 Velocity  3 Cycle-time  4 Throughput  5 WIP  6 CFD"));
    renderer.writeln();

    if (!this.metrics) {
      renderer.writeln(c.dim("  Loading metrics."));
      return;
    }

    if (this.selected === "burndown") renderBurndown(renderer, this.metrics.burndown);
    if (this.selected === "velocity") renderVelocity(renderer, this.metrics.velocity);
    if (this.selected === "cycle") renderCycleTime(renderer, this.metrics.cycleTime);
    if (this.selected === "throughput") renderThroughput(renderer, this.metrics.throughput);
    if (this.selected === "wip") renderWip(renderer, this.metrics.wip);
    if (this.selected === "cfd") renderCfd(renderer, this.metrics.cfd);
  }

  async handleKey(key: string): Promise<boolean> {
    const report = REPORT_KEYS[key];
    if (!report) return false;
    this.selected = report;
    return true;
  }
}

function renderBurndown(renderer: Renderer, rows: Metrics["burndown"]): void {
  renderer.writeln(c.bold("  Burndown"));
  renderer.writeln("  ideal | actual");
  for (const row of rows) {
    renderer.writeln(`  day ${row.day} | ${bar(row.ideal)} ${row.ideal} | ${bar(row.actual)} ${row.actual}`);
  }
}

function renderVelocity(renderer: Renderer, rows: Metrics["velocity"]): void {
  renderer.writeln(c.bold("  Velocity"));
  for (const row of rows.slice(-3)) {
    renderer.writeln(`  ${row.sprint} | ${bar(row.points)} ${row.points}`);
  }
}

function renderCycleTime(renderer: Renderer, values: number[]): void {
  renderer.writeln(c.bold("  Cycle-time"));
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) / 2)]!;
  renderer.writeln(`  median: ${median}`);
  for (const value of sorted) renderer.writeln(`  ${value}d | ${bar(value)}`);
}

function renderThroughput(renderer: Renderer, values: number[]): void {
  renderer.writeln(c.bold("  Throughput"));
  renderer.writeln(`  ${sparkline(values)}  ${values.join(" ")}`);
}

function renderWip(renderer: Renderer, values: Record<string, number>): void {
  renderer.writeln(c.bold("  WIP"));
  for (const [key, value] of Object.entries(values)) {
    renderer.writeln(`  ${key}: ${value}`);
  }
}

function renderCfd(renderer: Renderer, rows: Metrics["cfd"]): void {
  renderer.writeln(c.bold("  CFD"));
  for (const row of rows) {
    const label = String(row["day"] ?? "");
    const segments = Object.entries(row)
      .filter(([key]) => key !== "day")
      .map(([key, value]) => `${key[0]!.toUpperCase().repeat(Number(value) + (key === "done" ? 1 : 0))}`)
      .join("");
    renderer.writeln(`  ${label} | ${segments.replace(/(T+)(I+)(D+)/, "$1 $2$3")}`);
  }
}

function bar(value: number): string {
  return "#".repeat(Math.max(0, Math.round(value)));
}

function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  const ticks = "▁▂▃▄▅▆▇█";
  const max = Math.max(...values, 1);
  return values.map((value) => ticks[Math.min(ticks.length - 1, Math.round((value / max) * (ticks.length - 1)))]).join("");
}

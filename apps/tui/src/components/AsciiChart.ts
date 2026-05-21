/**
 * AsciiChart: ASCII chart rendering component using asciichart.
 *
 * Provides sparkline, bar chart, and line chart rendering for TUI screens.
 * Used by ReportsScreen for burndown, velocity, throughput, and WIP charts.
 *
 * D-83: TUI reports screen with ASCII charts
 * D-87: Uses asciichart package (not hand-rolled)
 */

import asciichart from "asciichart";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  value: number;
}

export interface LineChartOptions {
  height?: number;
  colors?: string[];
  offset?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline: single line of unicode block chars for velocity trend
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a single-line sparkline using unicode block characters.
 * Does NOT use asciichart: sparklines are inherently single-row.
 */
export function renderSparkline(data: number[], _width?: number): string {
  if (data.length === 0) return "";
  const ticks = "▁▂▃▄▅▆▇█";
  const max = Math.max(...data, 1);
  return data
    .map((v) => ticks[Math.min(ticks.length - 1, Math.round((v / max) * (ticks.length - 1)))])
    .join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Bar chart: ASCII horizontal bars for workload / per-assignee views
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render ASCII horizontal bar chart.
 * Format per row:
 *   label [===========     ] value
 */
export function renderBarChart(data: BarDatum[], maxBarWidth = 30): string {
  if (data.length === 0) return "(no data)";
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const maxLabelLen = Math.max(...data.map((d) => d.label.length));

  const lines = data.map(({ label, value }) => {
    const barLen = Math.round((value / maxValue) * maxBarWidth);
    const bar = "=".repeat(barLen) + " ".repeat(maxBarWidth - barLen);
    const paddedLabel = label.padEnd(maxLabelLen);
    return `${paddedLabel} [${bar}] ${value}`;
  });

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Line chart: multi-series chart via asciichart (burndown, burnup, cfd)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a multi-series line chart using asciichart.plot().
 * series: array of number arrays: each is one line on the chart.
 * labels: optional legend labels for each series.
 */
export function renderLineChart(series: number[][], labels?: string[], opts: LineChartOptions = {}): string {
  if (series.length === 0 || series[0]!.length === 0) return "(no data)";

  const height = opts.height ?? 10;
  const offset = opts.offset ?? 3;

  // asciichart accepts a single series (number[]) or multi-series (number[][])
  const plotData: number[] | number[][] = series.length === 1 ? series[0]! : series;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plotOpts: Record<string, any> = { height, offset };
  if (opts.colors && opts.colors.length > 0) {
    plotOpts["colors"] = opts.colors;
  }

  const chart = asciichart.plot(plotData as number[], plotOpts);

  if (!labels || labels.length === 0) return chart;

  // Append legend
  const legend = labels.map((label, i) => `  ── ${label}`).join("   ");
  return `${chart}\n${legend}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: cycle time percentile stats table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render cycle time distribution as percentile stats.
 * Returns formatted string: P50 / P85 / P95 per row.
 */
export function renderCycleTimeStats(values: number[]): string {
  if (values.length === 0) return "(no data)";
  const sorted = [...values].sort((a, b) => a - b);
  const p = (pct: number): number => {
    const idx = Math.floor((pct / 100) * (sorted.length - 1));
    return sorted[idx] ?? 0;
  };
  const lines = [
    `  P50 (median): ${p(50)} days`,
    `  P85:          ${p(85)} days`,
    `  P95:          ${p(95)} days`,
    `  Min:          ${sorted[0] ?? 0} days`,
    `  Max:          ${sorted[sorted.length - 1] ?? 0} days`,
    `  Count:        ${sorted.length} tasks`,
  ];
  return lines.join("\n");
}

/**
 * ASCII chart renderer with TUI size-aware scaling.
 *
 * Provides: burndown line, velocity bar, sparkline, histogram.
 * Deterministic snapshot output for testing.
 */

export interface ChartOpts {
  width?: number;
  height?: number;
}

/** Render a burndown line chart. */
export function renderBurndown(data: number[], opts: ChartOpts = {}): string {
  if (data.length === 0) return "";
  const height = opts.height ?? 10;
  const width = opts.width ?? 60;
  const chartWidth = Math.max(width - 8, 10);
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const rows = Math.max(height, 2);
  const grid = Array.from({ length: rows }, () => Array.from({ length: chartWidth }, () => " "));

  for (let i = 0; i < data.length; i++) {
    const value = data[i]!;
    const x = data.length === 1 ? 0 : Math.round((i / (data.length - 1)) * (chartWidth - 1));
    const y = rows - 1 - Math.round(((value - min) / range) * (rows - 1));
    grid[y]![x] = "*";
  }

  return grid.map((row, index) => {
    const value = max - ((range / Math.max(rows - 1, 1)) * index);
    return `${value.toFixed(0).padStart(4)} |${row.join("")}`;
  }).join("\n");
}

/** Render a velocity bar chart (horizontal bars). */
export function renderVelocityBar(data: number[], opts: ChartOpts = {}): string {
  const width = opts.width ?? 40;
  const max = Math.max(...data, 1);
  const lines: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const val = data[i]!;
    const barLen = Math.round((val / max) * (width - 10));
    const bar = "█".repeat(barLen);
    lines.push(`S${(i + 1).toString().padStart(2)} │${bar} ${val}`);
  }
  return lines.join("\n");
}

/** Sparkline chars for inline mini-charts. */
const SPARK_CHARS = "▁▂▃▄▅▆▇█";

/** Render a sparkline (single-line mini-chart). */
export function renderSparkline(data: number[]): string {
  if (data.length === 0) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data
    .map((v) => {
      const idx = Math.round(((v - min) / range) * (SPARK_CHARS.length - 1));
      return SPARK_CHARS[idx];
    })
    .join("");
}

/** Render a histogram (vertical bar chart using block chars). */
export function renderHistogram(data: number[], opts: ChartOpts = {}): string {
  const width = opts.width ?? 30;
  const max = Math.max(...data, 1);
  const lines: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const val = data[i]!;
    const barLen = Math.round((val / max) * (width - 8));
    const bar = "█".repeat(barLen);
    lines.push(`${i.toString().padStart(3)} │${bar}`);
  }
  return lines.join("\n");
}

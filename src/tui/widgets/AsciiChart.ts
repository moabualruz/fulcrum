/**
 * ASCII chart renderer — asciichart wrapper with TUI size-aware scaling.
 *
 * Provides: burndown line, velocity bar, sparkline, histogram.
 * Deterministic snapshot output for testing.
 */

import asciichart from "asciichart";

export interface ChartOpts {
  width?: number;
  height?: number;
}

/** Render a burndown line chart. */
export function renderBurndown(data: number[], opts: ChartOpts = {}): string {
  const height = opts.height ?? 10;
  const width = opts.width ?? 60;
  // asciichart.plot takes the data and renders a line chart
  return asciichart.plot(data, {
    height,
    width: Math.max(width - 10, 10), // account for axis labels
    format: (x: number) => x.toFixed(0).padStart(4),
  });
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

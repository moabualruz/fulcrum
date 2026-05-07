<script lang="ts">
  import { browser } from "$app/environment";
  import { ScatterChart } from "layerchart";

  interface CycleTimePoint {
    taskId: string;
    completedAt: string;
    cycleTimeHours: number;
  }

  interface Percentiles {
    p50: number;
    p75: number;
    p95: number;
  }

  interface Props {
    data: CycleTimePoint[];
    percentiles?: Percentiles;
    height?: number;
  }

  let { data = [], percentiles, height = 320 }: Props = $props();
</script>

<div data-testid="cycle-time-chart" class="cycle-time-chart" style="height: {height}px;">
  {#if browser && data.length > 0}
    <ScatterChart
      {data}
      x={(d: CycleTimePoint) => new Date(d.completedAt)}
      y={(d: CycleTimePoint) => d.cycleTimeHours / 8}
      props={{
        points: { r: 5, fill: "hsl(var(--chart-1))", fillOpacity: 0.7 },
      }}
      tooltip
      grid
      axis
    />
    {#if percentiles}
      <div class="percentile-legend" style="display: flex; gap: 1rem; font-size: 0.75rem; margin-top: 0.5rem; color: hsl(var(--muted-foreground));">
        <span>P50: {(percentiles.p50 / 8).toFixed(1)}d</span>
        <span>P75: {(percentiles.p75 / 8).toFixed(1)}d</span>
        <span>P95: {(percentiles.p95 / 8).toFixed(1)}d</span>
      </div>
    {/if}
  {:else if !browser}
    <div class="chart-ssr-placeholder" style="height: {height}px; background: hsl(var(--muted)); border-radius: 0.5rem;"></div>
  {:else}
    <div class="chart-empty" style="height: {height}px; display: flex; align-items: center; justify-content: center; color: hsl(var(--muted-foreground));">
      No cycle time data available
    </div>
  {/if}
</div>

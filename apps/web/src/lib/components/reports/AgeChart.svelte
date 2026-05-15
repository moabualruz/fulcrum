<script lang="ts">
  /**
   * AgeChart.svelte — Task age horizontal bar chart (workflow milestone, D-44).
   *
   * Shows current items grouped by status, bar length = days in current status.
   * Items > 14 days highlighted red (stale).
   */
  import { browser } from "$app/environment";
  import { BarChart } from "layerchart";

  interface AgePoint {
    taskTitle: string;
    status: string;
    daysInStatus: number;
  }

  interface Props {
    data?: AgePoint[];
    height?: number;
    /** Days threshold for "stale" highlight */
    staleThreshold?: number;
  }

  let { data = [], height = 320, staleThreshold = 14 }: Props = $props();

  const chartData = $derived(
    data
      .slice()
      .sort((a, b) => b.daysInStatus - a.daysInStatus)
      .map((d) => ({
        ...d,
        color: d.daysInStatus > staleThreshold
          ? "hsl(var(--destructive))"
          : "hsl(var(--chart-2))",
      }))
  );
</script>

<div data-testid="age-chart" class="age-chart" style="height: {height}px;">
  {#if browser && chartData.length > 0}
    <BarChart
      data={chartData}
      x={(d: AgePoint & { color: string }) => d.daysInStatus}
      y={(d: AgePoint & { color: string }) => d.taskTitle}
      orientation="horizontal"
      tooltip
      grid
      axis
    />
  {:else if !browser}
    <div class="chart-ssr-placeholder" style="height: {height}px; background: hsl(var(--muted)); border-radius: 0.5rem;"></div>
  {:else}
    <div
      class="chart-empty"
      style="height: {height}px; display: flex; align-items: center; justify-content: center; color: hsl(var(--muted-foreground));"
    >
      No age data available
    </div>
  {/if}
</div>

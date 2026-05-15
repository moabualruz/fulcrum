<script lang="ts">
  /**
   * ScopeChart.svelte — Scope creep line chart (workflow milestone, D-46).
   *
   * Shows original scope vs current scope vs completed over time.
   * Visualizes scope added vs completed per week.
   */
  import { browser } from "$app/environment";
  import { LineChart } from "layerchart";

  interface ScopePoint {
    date: string;
    original: number;
    current: number;
    completed: number;
  }

  interface Props {
    data?: ScopePoint[];
    height?: number;
  }

  let { data = [], height = 320 }: Props = $props();

  const chartData = $derived(
    data.map((d) => ({
      ...d,
      date: new Date(d.date),
    }))
  );

  const series = [
    {
      key: "original",
      label: "Original Scope",
      value: (d: ScopePoint) => d.original,
      color: "hsl(var(--chart-3))",
      props: { strokeDasharray: "6 3" },
    },
    {
      key: "current",
      label: "Current Scope",
      value: (d: ScopePoint) => d.current,
      color: "hsl(var(--chart-1))",
    },
    {
      key: "completed",
      label: "Completed",
      value: (d: ScopePoint) => d.completed,
      color: "hsl(var(--chart-2))",
    },
  ];
</script>

<div data-testid="scope-chart" class="scope-chart" style="height: {height}px;">
  {#if browser && chartData.length > 0}
    <LineChart
      data={chartData}
      x={(d: ScopePoint & { date: Date }) => d.date}
      y={(d: ScopePoint) => d.current}
      {series}
      legend
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
      No scope data available
    </div>
  {/if}
</div>

<script lang="ts">
  import { browser } from "$app/environment";
  import { LineChart } from "layerchart";

  interface BurndownPoint {
    date: string;
    remaining: number;
    ideal: number;
  }

  interface Props {
    data: BurndownPoint[];
    height?: number;
  }

  let { data = [], height = 320 }: Props = $props();

  // Transform data for multi-series LineChart
  const chartData = $derived(
    data.map((d) => ({
      date: new Date(d.date),
      remaining: d.remaining,
      ideal: d.ideal,
    }))
  );

  const series = [
    {
      key: "remaining",
      label: "Actual",
      value: (d: { remaining: number }) => d.remaining,
      color: "hsl(var(--chart-1))",
    },
    {
      key: "ideal",
      label: "Ideal",
      value: (d: { ideal: number }) => d.ideal,
      color: "hsl(var(--chart-2))",
      props: { strokeDasharray: "6 3" },
    },
  ];
</script>

<div data-testid="burndown-chart" class="burndown-chart" style="height: {height}px;">
  {#if browser && chartData.length > 0}
    <LineChart
      {data}
      x={(d: BurndownPoint) => new Date(d.date)}
      y={(d: BurndownPoint) => d.remaining}
      {series}
      legend
      tooltip
      grid
      axis
    />
  {:else if !browser}
    <div class="chart-ssr-placeholder" style="height: {height}px; background: hsl(var(--muted)); border-radius: 0.5rem;"></div>
  {:else}
    <div class="chart-empty" style="height: {height}px; display: flex; align-items: center; justify-content: center; color: hsl(var(--muted-foreground));">
      No burndown data available
    </div>
  {/if}
</div>

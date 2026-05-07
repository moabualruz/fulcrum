<script lang="ts">
  import { browser } from "$app/environment";
  import { BarChart } from "layerchart";

  interface ThroughputPoint {
    week: string;
    completed: number;
    average: number;
  }

  interface Props {
    data: ThroughputPoint[];
    height?: number;
  }

  let { data = [], height = 320 }: Props = $props();

  const series = [
    {
      key: "completed",
      label: "Completed",
      value: (d: ThroughputPoint) => d.completed,
      color: "hsl(var(--chart-1))",
    },
    {
      key: "average",
      label: "Rolling Avg",
      value: (d: ThroughputPoint) => d.average,
      color: "hsl(var(--chart-2))",
      props: { strokeDasharray: "4 2" },
    },
  ];
</script>

<div data-testid="throughput-chart" class="throughput-chart" style="height: {height}px;">
  {#if browser && data.length > 0}
    <BarChart
      {data}
      x={(d: ThroughputPoint) => d.week}
      y={(d: ThroughputPoint) => d.completed}
      series={[series[0]!]}
      legend
      tooltip
      grid
      axis
    />
  {:else if !browser}
    <div class="chart-ssr-placeholder" style="height: {height}px; background: hsl(var(--muted)); border-radius: 0.5rem;"></div>
  {:else}
    <div class="chart-empty" style="height: {height}px; display: flex; align-items: center; justify-content: center; color: hsl(var(--muted-foreground));">
      No throughput data available
    </div>
  {/if}
</div>

<script lang="ts">
  import { browser } from "$app/environment";
  import { BarChart, LineChart } from "layerchart";

  interface VelocityPoint {
    sprint: string;
    completed: number;
    average: number;
  }

  interface Props {
    data: VelocityPoint[];
    height?: number;
  }

  let { data = [], height = 320 }: Props = $props();

  // Color bars: green if >= average, amber if below
  const coloredData = $derived(
    data.map((d) => ({
      ...d,
      color: d.completed >= d.average ? "hsl(var(--chart-3))" : "hsl(var(--chart-4))",
    }))
  );

  const series = [
    {
      key: "completed",
      label: "Completed",
      value: (d: VelocityPoint & { color: string }) => d.completed,
      color: "hsl(var(--chart-1))",
    },
  ];
</script>

<div data-testid="velocity-chart" class="velocity-chart" style="height: {height}px;">
  {#if browser && data.length > 0}
    <BarChart
      data={coloredData}
      x={(d: VelocityPoint) => d.sprint}
      y={(d: VelocityPoint) => d.completed}
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
      No velocity data available
    </div>
  {/if}
</div>

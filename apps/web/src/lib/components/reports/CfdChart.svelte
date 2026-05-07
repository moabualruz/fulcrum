<script lang="ts">
  import { browser } from "$app/environment";
  import { AreaChart } from "layerchart";

  // CFD: each row has date + count per status
  interface CfdPoint {
    date: string;
    [status: string]: number | string;
  }

  interface Props {
    data: CfdPoint[];
    statuses?: string[];
    height?: number;
  }

  let { data = [], statuses, height = 320 }: Props = $props();

  // Derive statuses from data if not provided
  const derivedStatuses = $derived(
    statuses ?? (data.length > 0 ? Object.keys(data[0]!).filter((k) => k !== "date") : [])
  );

  const statusColors: Record<string, string> = {
    backlog: "hsl(var(--chart-1))",
    unstarted: "hsl(var(--chart-2))",
    started: "hsl(var(--chart-3))",
    completed: "hsl(var(--chart-4))",
    canceled: "hsl(var(--chart-5))",
  };

  const series = $derived(
    derivedStatuses.map((status, i) => ({
      key: status,
      label: status.charAt(0).toUpperCase() + status.slice(1),
      value: (d: CfdPoint) => (d[status] as number) ?? 0,
      color: statusColors[status] ?? `hsl(var(--chart-${(i % 8) + 1}))`,
    }))
  );
</script>

<div data-testid="cfd-chart" class="cfd-chart" style="height: {height}px;">
  {#if browser && data.length > 0}
    <AreaChart
      {data}
      x={(d: CfdPoint) => new Date(d.date)}
      y={(d: CfdPoint) => derivedStatuses.reduce((sum, s) => sum + ((d[s] as number) ?? 0), 0)}
      {series}
      seriesLayout="stack"
      legend
      tooltip
      grid
      axis
    />
  {:else if !browser}
    <div class="chart-ssr-placeholder" style="height: {height}px; background: hsl(var(--muted)); border-radius: 0.5rem;"></div>
  {:else}
    <div class="chart-empty" style="height: {height}px; display: flex; align-items: center; justify-content: center; color: hsl(var(--muted-foreground));">
      No flow data available
    </div>
  {/if}
</div>

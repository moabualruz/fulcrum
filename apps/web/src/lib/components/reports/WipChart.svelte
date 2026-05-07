<script lang="ts">
  import { browser } from "$app/environment";
  import { AreaChart } from "layerchart";

  interface WipPoint {
    date: string;
    wipCount: number;
    limit?: number;
  }

  interface Props {
    data: WipPoint[];
    height?: number;
  }

  let { data = [], height = 320 }: Props = $props();

  const wipLimit = $derived(data.find((d) => d.limit != null)?.limit);
</script>

<div data-testid="wip-chart" class="wip-chart" style="height: {height}px;">
  {#if browser && data.length > 0}
    <AreaChart
      {data}
      x={(d: WipPoint) => new Date(d.date)}
      y={(d: WipPoint) => d.wipCount}
      series={[
        {
          key: "wipCount",
          label: "WIP",
          value: (d: WipPoint) => d.wipCount,
          color: "hsl(var(--chart-1))",
        },
      ]}
      tooltip
      grid
      axis
    />
    {#if wipLimit != null}
      <div class="wip-limit-note" style="font-size: 0.75rem; color: hsl(var(--chart-5)); margin-top: 0.25rem;">
        WIP Limit: {wipLimit}
      </div>
    {/if}
  {:else if !browser}
    <div class="chart-ssr-placeholder" style="height: {height}px; background: hsl(var(--muted)); border-radius: 0.5rem;"></div>
  {:else}
    <div class="chart-empty" style="height: {height}px; display: flex; align-items: center; justify-content: center; color: hsl(var(--muted-foreground));">
      No WIP data available
    </div>
  {/if}
</div>

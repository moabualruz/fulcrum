<script lang="ts">
  /**
   * WorkloadChart.svelte — Per-assignee stacked bar chart (workflow milestone, D-48).
   *
   * Shows task count per assignee broken down by status category.
   * Helps identify who's overloaded vs underutilized.
   */
  import { browser } from "$app/environment";
  import { BarChart } from "layerchart";

  interface WorkloadPoint {
    assignee: string;
    backlog: number;
    started: number;
    completed: number;
    blocked?: number;
  }

  interface Props {
    data?: WorkloadPoint[];
    height?: number;
  }

  let { data = [], height = 320 }: Props = $props();

  const series = [
    {
      key: "backlog",
      label: "Backlog",
      value: (d: WorkloadPoint) => d.backlog,
      color: "hsl(var(--chart-3))",
    },
    {
      key: "started",
      label: "In Progress",
      value: (d: WorkloadPoint) => d.started,
      color: "hsl(var(--chart-1))",
    },
    {
      key: "completed",
      label: "Completed",
      value: (d: WorkloadPoint) => d.completed,
      color: "hsl(var(--chart-2))",
    },
    {
      key: "blocked",
      label: "Blocked",
      value: (d: WorkloadPoint) => d.blocked ?? 0,
      color: "hsl(var(--destructive))",
    },
  ];
</script>

<div data-testid="workload-chart" class="workload-chart" style="height: {height}px;">
  {#if browser && data.length > 0}
    <BarChart
      {data}
      x={(d: WorkloadPoint) => d.assignee}
      y={(d: WorkloadPoint) => d.started + d.backlog + (d.blocked ?? 0)}
      {series}
      stacked
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
      No workload data available
    </div>
  {/if}
</div>

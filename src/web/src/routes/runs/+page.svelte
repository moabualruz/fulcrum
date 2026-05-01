<script lang="ts">
  import type { PageData } from "./$types";
  import RunsTable from "$lib/components/runs/RunsTable.svelte";
  import type { SortColumn, SortDirection } from "$lib/components/runs/runs-table-sort";
  import { buttonVariants } from "$lib/components/ui/button";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const STATUSES = [
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
  ] as const;

  const RANGES = ["24h", "7d", "30d", "all"] as const;

  // Client-side sort state (server provides initial unsorted dataset; clicking
  // a header re-orders in place without a round-trip).
  let sort = $state<{ column: SortColumn; direction: SortDirection } | undefined>(
    undefined,
  );

  function onSort(column: SortColumn): void {
    if (sort && sort.column === column) {
      sort = { column, direction: sort.direction === "asc" ? "desc" : "asc" };
    } else {
      sort = { column, direction: "asc" };
    }
  }

  // Distinct agent slugs for the filter dropdown — derived from the loaded
  // dataset so users only ever pick agents they actually have runs for.
  const agents = $derived(
    Array.from(new Set(data.runs.map((r) => r.agent))).sort(),
  );
</script>

<header
  data-runs-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Agent runs</h1>
</header>

<form
  data-runs-filter
  method="GET"
  class={cn("mb-3 flex flex-wrap items-center gap-2")}
>
  <select
    data-runs-agent-filter
    name="agent"
    class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
  >
    <option value="" selected={data.filter.agent === ""}>All agents</option>
    {#each agents as agent (agent)}
      <option value={agent} selected={data.filter.agent === agent}>{agent}</option>
    {/each}
  </select>
  <select
    data-runs-status-filter
    name="status"
    class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
  >
    <option value="" selected={data.filter.status === ""}>All statuses</option>
    {#each STATUSES as status (status)}
      <option value={status} selected={data.filter.status === status}>{status}</option>
    {/each}
  </select>
  <select
    data-runs-range-filter
    name="range"
    class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
  >
    {#each RANGES as range (range)}
      <option value={range} selected={data.filter.range === range}>{range}</option>
    {/each}
  </select>
  <button
    type="submit"
    class={cn(buttonVariants({ variant: "outline" }))}
  >Apply</button>
</form>

{#if data.runs.length === 0}
  <div
    data-empty-runs
    class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
  >No agent runs match the current filters.</div>
{:else}
  <RunsTable rows={data.runs} {sort} {onSort} />
{/if}

<script lang="ts" module>
  export const COLUMNS = [
    { key: "agent", label: "Agent" },
    { key: "model", label: "Model" },
    { key: "status", label: "Status" },
    { key: "sandbox_mode", label: "Sandbox" },
    { key: "iteration_count", label: "Iterations" },
    { key: "started_at", label: "Started" },
    { key: "duration", label: "Duration" },
  ] as const;
</script>

<script lang="ts">
  import RunStatusBadge from "./RunStatusBadge.svelte";
  import { formatDuration } from "$lib/util/duration";
  import type { RunRow } from "./runs-filters.ts";
  import {
    sortRunRows,
    type SortColumn,
    type SortDirection,
  } from "./runs-table-sort.ts";
  import { cn } from "$lib/utils.js";

  interface Props {
    rows: RunRow[];
    sort?: { column: SortColumn; direction: SortDirection };
    onSort?: (column: SortColumn) => void;
  }

  const { rows, sort, onSort }: Props = $props();

  const sortedRows = $derived(
    sort ? sortRunRows(rows, sort.column, sort.direction) : rows,
  );

  function formatStarted(value: string): string {
    return value.slice(0, 16).replace("T", " ");
  }
</script>

<div data-runs-table class={cn("relative w-full overflow-x-auto")}>
  <table class={cn("w-full caption-bottom text-sm")}>
    <thead class={cn("[&_tr]:border-b")}>
      <tr class={cn("border-b transition-colors")}>
        {#each COLUMNS as col (col.key)}
          <th
            data-runs-th
            data-column={col.key}
            class={cn("h-10 px-2 text-left align-middle font-medium")}
          >
            <button
              type="button"
              data-runs-sort={col.key}
              onclick={() => onSort?.(col.key as SortColumn)}
              class={cn("inline-flex items-center gap-1 hover:underline")}
            >
              {col.label}
              {#if sort?.column === col.key}
                <span data-runs-sort-direction
                  >{sort.direction === "asc" ? "↑" : "↓"}</span
                >
              {/if}
            </button>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody class={cn("[&_tr:last-child]:border-0")}>
      {#each sortedRows as row (row.id)}
        <tr
          data-runs-row
          data-run-id={row.id}
          class={cn("hover:bg-muted/50 border-b transition-colors")}
        >
          <td class={cn("p-2 align-middle font-medium")}
            ><a
              data-runs-row-link
              href={`/runs/${row.id}`}
              class={cn("hover:underline")}>{row.agent}</a
            ></td
          >
          <td class={cn("p-2 align-middle text-muted-foreground")}
            >{row.model ?? "—"}</td
          >
          <td class={cn("p-2 align-middle")}
            ><RunStatusBadge status={row.status} /></td
          >
          <td class={cn("p-2 align-middle text-xs text-muted-foreground")}
            >{#if row.sandbox_mode}<span data-sandbox-chip class={cn("inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs")}>{row.sandbox_mode}</span>{:else}—{/if}</td
          >
          <td class={cn("p-2 align-middle text-muted-foreground")}
            >{row.iteration_count ?? 0}</td
          >
          <td
            class={cn("p-2 align-middle font-mono text-xs text-muted-foreground")}
            >{formatStarted(row.started_at)}</td
          >
          <td class={cn("p-2 align-middle text-muted-foreground")}
            >{formatDuration(row.started_at, row.ended_at)}</td
          >
        </tr>
      {/each}
    </tbody>
  </table>
</div>

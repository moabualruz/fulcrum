<script lang="ts" module>
  export const COLUMNS = [
    { key: "run", label: "Run", sortable: false },
    { key: "task_title", label: "Task", sortable: true },
    { key: "model", label: "Model" },
    { key: "status", label: "Status" },
    { key: "agent", label: "Agent" },
    { key: "last_event_at", label: "Last event", sortable: true },
    { key: "started_at", label: "Started" },
    { key: "duration", label: "Elapsed" },
    { key: "events", label: "Events", sortable: false },
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

  function formatTimestamp(value: string | null | undefined): string {
    if (!value) return "No events";
    return value.slice(0, 16).replace("T", " ");
  }

  function eventSummary(payload: Record<string, unknown>): string {
    const summary = payload.summary ?? payload.message ?? payload.status ?? payload.reason;
    return typeof summary === "string" && summary.trim().length > 0 ? summary : "event recorded";
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
            {#if col.sortable === false}
              <span>{col.label}</span>
            {:else}
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
            {/if}
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
              class={cn("font-mono text-xs hover:underline")}
              >{row.id}</a
            ></td
          >
          <td data-run-task-cell class={cn("max-w-48 p-2 align-middle")}>
            <div class={cn("truncate font-medium")}>{row.task_title ?? row.task_id ?? "No task"}</div>
            {#if row.task_id}
              <div class={cn("font-mono text-[11px] text-muted-foreground")}>{row.task_id}</div>
            {/if}
          </td>
          <td class={cn("p-2 align-middle text-muted-foreground")}
            >{row.model ?? "-"}</td
          >
          <td class={cn("p-2 align-middle")}
            ><RunStatusBadge status={row.status} /></td
          >
          <td class={cn("p-2 align-middle text-muted-foreground")}>{row.agent}</td>
          <td
            data-run-last-event-at
            class={cn("p-2 align-middle font-mono text-xs text-muted-foreground")}
            >{formatTimestamp(row.last_event_at)}</td
          >
          <td
            class={cn("p-2 align-middle font-mono text-xs text-muted-foreground")}
            >{formatStarted(row.started_at)}</td
          >
          <td class={cn("p-2 align-middle text-muted-foreground")}
            >{formatDuration(row.started_at, row.ended_at)}</td
          >
          <td class={cn("p-2 align-middle")}>
            <details data-run-event-timeline={row.id} class={cn("min-w-40")}>
              <summary data-runs-expand class={cn("cursor-pointer text-xs font-medium underline-offset-2 hover:underline")}>
                {row.recent_events?.length ?? 0} events
              </summary>
              <ol class={cn("mt-2 space-y-2 border-l border-border pl-3")}>
                {#if row.recent_events && row.recent_events.length > 0}
                  {#each row.recent_events as event (event.id)}
                    <li data-run-event class={cn("text-xs")}>
                      <div class={cn("font-medium")}>{event.verb}</div>
                      <div class={cn("font-mono text-[11px] text-muted-foreground")}>{formatTimestamp(event.created_at)} · {event.actor}</div>
                      <div class={cn("text-muted-foreground")}>{eventSummary(event.payload)}</div>
                    </li>
                  {/each}
                {:else}
                  <li data-run-event-empty class={cn("text-xs text-muted-foreground")}>No events recorded.</li>
                {/if}
              </ol>
            </details>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

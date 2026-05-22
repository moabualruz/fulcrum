<script lang="ts">
  import type { SortDirection } from "@fulcrum/shared-dto";
  import { cn, Select } from "@fulcrum/ui-kit";

  type SortField = "key" | "title" | "state" | "priority" | "estimate" | "updated";

  interface ViewTask {
    key: string;
    title: string;
    state: string;
    priority: number;
    estimate: number;
    updated: string;
  }

  const SORT_FIELDS: Array<{ id: SortField; label: string; align?: "left" | "center" | "right" }> = [
    { id: "key", label: "Key" },
    { id: "title", label: "Title" },
    { id: "state", label: "State" },
    { id: "priority", label: "Priority", align: "center" },
    { id: "estimate", label: "Estimate", align: "right" },
    { id: "updated", label: "Updated" },
  ];

  const TASKS: ViewTask[] = [
    { key: "FUL-204", title: "Wire view sorting", state: "running", priority: 1, estimate: 8, updated: "2026-05-18" },
    { key: "FUL-198", title: "Review saved filter", state: "waiting-input", priority: 3, estimate: 3, updated: "2026-05-16" },
    { key: "FUL-211", title: "Tighten mobile controls", state: "queued", priority: 2, estimate: 5, updated: "2026-05-17" },
    { key: "FUL-176", title: "Archive stale view", state: "completed", priority: 4, estimate: 1, updated: "2026-05-15" },
  ];

  let sortField = $state<SortField | "">("updated");
  let sortDirection = $state<SortDirection>("desc");

  const sortedTasks = $derived.by(() => {
    if (!sortField) return TASKS;
    return [...TASKS].sort((a, b) => {
      const left = a[sortField];
      const right = b[sortField];
      const order = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));
      return sortDirection === "asc" ? order : -order;
    });
  });

  const currentSortLabel = $derived.by(() => {
    const field = SORT_FIELDS.find((item) => item.id === sortField);
    if (!field) return "Original order";
    return `${field.label} ${sortDirection}`;
  });

  function toggleHeaderSort(field: SortField): void {
    if (sortField === field) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
      return;
    }
    sortField = field;
    sortDirection = "asc";
  }

  function setSortField(value: string): void {
    sortField = value as SortField;
  }

  function clearSort(): void {
    sortField = "";
    sortDirection = "asc";
  }

  function indicator(field: SortField): string {
    if (sortField !== field) return "sortable";
    return sortDirection;
  }
</script>

<svelte:head>
  <title>View controls - Fulcrum</title>
</svelte:head>

<main class={cn("min-h-screen bg-background text-foreground")}>
  <section class={cn("mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8")} data-view-controls-ready="true">
    <header class={cn("flex flex-col gap-3 border-b border-border pb-4")}>
      <div class={cn("flex flex-wrap items-center justify-between gap-3")}>
        <div>
          <p class={cn("text-xs font-semibold uppercase tracking-normal text-muted-foreground")}>View controls</p>
          <h1 class={cn("text-2xl font-semibold")}>Task view sorting</h1>
        </div>
        <div
          class={cn("rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium")}
          data-current-sort
          aria-live="polite"
        >
          Sort: {currentSortLabel}
        </div>
      </div>
    </header>

    <section class={cn("flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:hidden")} data-mobile-sort-controls>
      <div class={cn("grid grid-cols-1 gap-3")}>
        <label class={cn("flex flex-col gap-1 text-sm font-medium")}>
          Sort field
          <select
            class={cn("h-10 rounded-md border border-input bg-background px-3 text-sm")}
            data-mobile-sort-field
            value={sortField}
            onchange={(event) => setSortField((event.currentTarget as HTMLSelectElement).value)}
          >
            {#each SORT_FIELDS as field}
              <option value={field.id}>{field.label}</option>
            {/each}
          </select>
        </label>
        <label class={cn("flex flex-col gap-1 text-sm font-medium")}>
          Direction
          <select
            class={cn("h-10 rounded-md border border-input bg-background px-3 text-sm")}
            data-mobile-sort-direction
            value={sortDirection}
            onchange={(event) => (sortDirection = (event.currentTarget as HTMLSelectElement).value as SortDirection)}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        class={cn("h-10 rounded-md border border-border px-3 text-sm font-medium")}
        data-clear-sort
        onclick={clearSort}
      >
        Clear sort
      </button>
    </section>

    <section class={cn("overflow-hidden rounded-md border border-border bg-card")} data-sortable-view>
      <div class={cn("hidden border-b border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground sm:block")}>
        Click any displayed field header to sort ascending; click again for descending.
      </div>
      <div class={cn("overflow-x-auto")}>
        <table class={cn("min-w-[760px] w-full text-sm")} data-sort-table>
          <thead class={cn("bg-muted/50")}>
            <tr>
              {#each SORT_FIELDS as field}
                <th class={cn(
                  "px-3 py-2 font-medium text-muted-foreground",
                  field.align === "center" ? "text-center" : field.align === "right" ? "text-right" : "text-left",
                )}>
                  <button
                    type="button"
                    class={cn("inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                    data-sort-header={field.id}
                    data-sort-state={indicator(field.id)}
                    aria-sort={sortField === field.id ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                    aria-label={`Sort by ${field.label}`}
                    onclick={() => toggleHeaderSort(field.id)}
                  >
                    <span>{field.label}</span>
                    <span
                      class={cn("rounded border border-border px-1.5 py-0.5 text-[11px] uppercase text-muted-foreground", {
                        "border-primary bg-primary text-primary-foreground": sortField === field.id,
                      })}
                      data-sort-indicator
                    >
                      {indicator(field.id)}
                    </span>
                  </button>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody class={cn("divide-y divide-border")} data-task-rows>
            {#each sortedTasks as task (task.key)}
              <tr data-task-row data-task-key={task.key} class={cn("hover:bg-muted/30")}>
                <td class={cn("px-3 py-3 font-mono text-xs text-muted-foreground")}>{task.key}</td>
                <td class={cn("px-3 py-3 font-medium")}>{task.title}</td>
                <td class={cn("px-3 py-3")}>
                  <span class={cn("rounded-md border border-border bg-background px-2 py-1 text-xs")}>{task.state}</span>
                </td>
                <td class={cn("px-3 py-3 text-center")}>P{task.priority}</td>
                <td class={cn("px-3 py-3 text-right")}>{task.estimate}</td>
                <td class={cn("px-3 py-3 text-muted-foreground")}>{task.updated}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </section>
</main>

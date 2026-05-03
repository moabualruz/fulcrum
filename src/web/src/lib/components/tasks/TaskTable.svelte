<script lang="ts">
  import { cn } from "$lib/utils.js";
  import type { TaskColumn, TaskSortDirection, TaskViewRow } from "./task-view-types";
  import { DEFAULT_TASK_COLUMNS, groupTaskRows, sortTaskRows, visibleTaskColumns } from "./task-table";

  interface Props {
    tasks: TaskViewRow[];
    sort?: { column: string; direction: TaskSortDirection };
    groupBy?: string | null;
    visibleColumns?: string[];
  }

  const { tasks, sort, groupBy = null, visibleColumns }: Props = $props();

  const columns = $derived(visibleTaskColumns(visibleColumns));
  const rows = $derived(sort ? sortTaskRows(tasks, sort.column, sort.direction) : tasks);
  const groups = $derived(groupTaskRows(rows, groupBy));

  function cell(task: TaskViewRow, column: TaskColumn): string {
    if (column.key === "title") return task.title;
    if (column.key === "status") return task.status;
    if (column.key === "assignee") return task.assignee ?? "Unassigned";
    if (column.key === "priority") return String(task.priority);
    if (column.key === "sprint") return task.sprint_name ?? task.sprint_id ?? "Backlog";
    if (column.key === "labels") return (task.labels ?? []).join(", ");
    if (column.key === "created_at") return (task.created_at ?? task.updated_at).slice(0, 10);
    return "";
  }
</script>

<section data-task-table class={cn("flex flex-col gap-3")}>
  <header class={cn("flex flex-wrap items-center justify-between gap-3")}>
    <div class={cn("flex items-center gap-2")}>
      <label for="task-filter" class={cn("text-sm font-medium")}>Filter</label>
      <input
        id="task-filter"
        data-task-filter
        name="q"
        type="search"
        placeholder="Filter tasks"
        class={cn("h-9 rounded-md border border-input bg-background px-3 text-sm")}
      />
    </div>
    <details data-column-visibility class={cn("relative")}>
      <summary class={cn("cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm")}>Columns</summary>
      <div class={cn("absolute right-0 z-10 mt-2 min-w-40 rounded-md border border-border bg-background p-2 shadow")}>
        {#each DEFAULT_TASK_COLUMNS as column (column.key)}
          <label class={cn("flex items-center gap-2 py-1 text-sm")}>
            <input data-column-toggle={column.key} type="checkbox" checked={columns.some((c) => c.key === column.key)} />
            <span>{column.label}</span>
          </label>
        {/each}
      </div>
    </details>
  </header>

  <div class={cn("relative w-full overflow-x-auto")}>
    <table class={cn("w-full caption-bottom text-sm")}>
      <thead class={cn("[&_tr]:border-b")}>
        <tr class={cn("border-b transition-colors")}>
          {#each columns as column (column.key)}
            <th data-task-column={column.key} class={cn("h-10 px-2 text-left align-middle font-medium")}>
              <button type="button" data-task-sort={column.key} class={cn("inline-flex items-center gap-1 hover:underline")}>
                {column.label}
                {#if sort?.column === column.key}
                  <span data-task-sort-direction>{sort.direction === "asc" ? "↑" : "↓"}</span>
                {/if}
              </button>
            </th>
          {/each}
        </tr>
      </thead>
      {#each groups as group (group.key)}
        <tbody data-task-group data-group-key={group.key} class={cn("[&_tr:last-child]:border-0")}>
          {#if groupBy}
            <tr class={cn("border-b bg-muted/40")}>
              <td colspan={columns.length} class={cn("px-2 py-2 font-medium")}>
                <button type="button" data-task-group-collapse={group.key} class={cn("inline-flex items-center gap-2")}>
                  <span>{group.label}</span>
                  <span data-task-group-count class={cn("text-xs text-muted-foreground")}>{group.tasks.length}</span>
                </button>
              </td>
            </tr>
          {/if}
          {#each group.tasks as task (task.id)}
            <tr data-task-row data-task-id={task.id} class={cn("hover:bg-muted/50 border-b transition-colors")}>
              {#each columns as column (column.key)}
                <td class={cn("p-2 align-middle")}>
                  {#if column.key === "title"}
                    <a data-task-row-link href={`/projects/${task.project_id ?? "unassigned"}/board?task=${task.id}`} class={cn("font-medium hover:underline")}>
                      {task.title}
                    </a>
                  {:else if column.key === "status"}
                    <form data-inline-status={task.id} action="?/update" method="POST">
                      <input type="hidden" name="intent" value="tasks.update" />
                      <input type="hidden" name="id" value={task.id} />
                      <select name="status" class={cn("h-8 rounded-md border border-input bg-background px-2 text-xs")} aria-label={`Status for ${task.title}`}>
                        {#each ["pending", "in_progress", "blocked", "completed", "cancelled"] as status (status)}
                          <option value={status} selected={task.status === status}>{status}</option>
                        {/each}
                      </select>
                    </form>
                  {:else}
                    {cell(task, column)}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      {/each}
    </table>
  </div>
</section>

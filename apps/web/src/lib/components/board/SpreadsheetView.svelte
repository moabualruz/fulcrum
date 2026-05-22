<script lang="ts">
  import type { BoardTask } from "$lib/product-queries";
  import type { TaskStatus } from "$lib/server/tasks";
  import { TASK_STATUSES, describeStatus } from "./board-helpers";
  import { cn } from "@fulcrum/ui-kit";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@fulcrum/ui-kit";

  interface Props {
    tasks: BoardTask[];
    onEdit?: (taskId: string) => void;
    onStatusChange?: (taskId: string, status: TaskStatus) => void;
  }

  let { tasks, onEdit, onStatusChange }: Props = $props();

  type SortKey = "title" | "status" | "priority" | "created_at";
  type SortDir = "asc" | "desc";

  let sortKey = $state<SortKey>("created_at");
  let sortDir = $state<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = "asc";
    }
  }

  const sorted = $derived(() => {
    const copy = [...tasks];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") cmp = (a.title ?? "").localeCompare(b.title ?? "");
      else if (sortKey === "status") cmp = (a.status ?? "").localeCompare(b.status ?? "");
      else if (sortKey === "priority") cmp = (a.priority ?? 4) - (b.priority ?? 4);
      else cmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  });

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }
</script>

<div data-spreadsheet-view class={cn("overflow-x-auto rounded-md border border-border")}>
  <table class={cn("w-full text-sm")}>
    <thead class={cn("bg-muted/50")}>
      <tr>
        <th
          data-sortable
          class={cn("cursor-pointer px-3 py-2 text-left font-medium text-muted-foreground select-none")}
          onclick={() => toggleSort("title")}
        >Title{sortIndicator("title")}</th>
        <th
          data-sortable
          class={cn("cursor-pointer px-3 py-2 text-left font-medium text-muted-foreground select-none w-32")}
          onclick={() => toggleSort("status")}
        >Status{sortIndicator("status")}</th>
        <th
          data-sortable
          class={cn("cursor-pointer px-3 py-2 text-center font-medium text-muted-foreground select-none w-20")}
          onclick={() => toggleSort("priority")}
        >Priority{sortIndicator("priority")}</th>
        <th
          data-sortable
          class={cn("cursor-pointer px-3 py-2 text-left font-medium text-muted-foreground select-none w-32")}
          onclick={() => toggleSort("created_at")}
        >Created{sortIndicator("created_at")}</th>
      </tr>
    </thead>
    <tbody class={cn("divide-y divide-border")}>
      {#each sorted as task (task.id)}
        <tr
          data-task-id={task.id}
          data-spreadsheet-row
          class={cn("hover:bg-muted/30 cursor-pointer")}
          onclick={() => onEdit?.(task.id)}
        >
          <td class={cn("px-3 py-2")}>
            <span class={cn("font-mono text-xs text-muted-foreground mr-2")}>{task.id.slice(0, 8)}</span>
            {task.title}
          </td>
          <td class={cn("px-3 py-2")}>
            <Select
              value={task.status}
              type="single"
              onValueChange={(value) => onStatusChange?.(task.id, value as TaskStatus)}
            >
              <SelectTrigger
                data-status-select
                aria-label={`Status for ${task.title}`}
                size="sm"
                class="h-7 w-32 text-xs"
                onclick={(e) => e.stopPropagation()}
              >
                <SelectValue placeholder={describeStatus(task.status)} />
              </SelectTrigger>
              <SelectContent>
                {#each TASK_STATUSES as s}
                  <SelectItem value={s} label={describeStatus(s)} />
                {/each}
              </SelectContent>
            </Select>
          </td>
          <td class={cn("px-3 py-2 text-center")}>
            <span class={cn("text-xs font-medium", {
              "text-destructive": task.priority === 1,
              "text-orange-500": task.priority === 2,
              "text-yellow-500": task.priority === 3,
              "text-muted-foreground": !task.priority || task.priority >= 4,
            })}>P{task.priority ?? 4}</span>
          </td>
          <td class={cn("px-3 py-2 text-xs text-muted-foreground")}>
            {task.created_at ? new Date(task.created_at).toLocaleDateString() : "-"}
          </td>
        </tr>
      {/each}
      {#if tasks.length === 0}
        <tr><td colspan="4" class={cn("px-3 py-8 text-center text-muted-foreground")}>No tasks</td></tr>
      {/if}
    </tbody>
  </table>
</div>

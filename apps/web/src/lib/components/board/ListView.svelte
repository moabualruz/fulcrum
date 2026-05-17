<script lang="ts">
  import type { BoardTask } from "$lib/product-queries";
  import type { TaskStatus } from "$lib/server/tasks";
  import { TASK_STATUSES, describeStatus } from "./board-helpers";
  import { cn } from "$lib/utils.js";

  interface Props {
    tasks: BoardTask[];
    groupBy?: "status" | "priority" | "project";
    onEdit?: (taskId: string) => void;
    onStatusChange?: (taskId: string, status: TaskStatus) => void;
  }

  let { tasks, groupBy = "status", onEdit, onStatusChange }: Props = $props();

  type GroupedTasks = Record<string, BoardTask[]>;

  const grouped = $derived<GroupedTasks>(() => {
    const groups: GroupedTasks = {};
    for (const task of tasks) {
      const key = groupBy === "status" ? (task.status ?? "todo")
        : groupBy === "priority" ? String(task.priority ?? 0)
        : (task.project_id ?? "unassigned");
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    }
    return groups;
  });

  const groupKeys = $derived(
    groupBy === "status" ? TASK_STATUSES : Object.keys(grouped).sort()
  );

  function groupLabel(key: string): string {
    if (groupBy === "status") return describeStatus(key as TaskStatus);
    if (groupBy === "priority") {
      const labels: Record<string, string> = { "0": "None", "1": "Urgent", "2": "High", "3": "Medium", "4": "Low" };
      return labels[key] ?? `Priority ${key}`;
    }
    return key;
  }
</script>

<div data-list-view class={cn("flex flex-col gap-1")}>
  {#each groupKeys as key (key)}
    {@const groupTasks = grouped[key] ?? []}
    <div data-list-group data-group={key} class={cn("rounded-md border border-border")}>
      <button
        type="button"
        class={cn("flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50")}
        aria-expanded="true"
      >
        <span class={cn("text-muted-foreground")}>{groupLabel(key)}</span>
        <span class={cn("ml-auto text-xs text-muted-foreground")}>{groupTasks.length}</span>
      </button>
      <div class={cn("divide-y divide-border")}>
        {#each groupTasks as task (task.id)}
          <div
            data-task-id={task.id}
            data-list-row
            class={cn("flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30 cursor-pointer")}
            role="button"
            tabindex="0"
            onclick={() => onEdit?.(task.id)}
            onkeydown={(e) => e.key === "Enter" && onEdit?.(task.id)}
          >
            <span class={cn("w-16 shrink-0 text-xs text-muted-foreground font-mono")}>{task.id.slice(0, 8)}</span>
            <span class={cn("flex-1 truncate")}>{task.title}</span>
            <select
              data-status-select
              class={cn("h-7 rounded border border-input bg-background px-2 text-xs")}
              value={task.status}
              onchange={(e) => onStatusChange?.(task.id, (e.target as HTMLSelectElement).value as TaskStatus)}
              onclick={(e) => e.stopPropagation()}
            >
              {#each TASK_STATUSES as s}
                <option value={s}>{describeStatus(s)}</option>
              {/each}
            </select>
            <span class={cn("w-8 text-center text-xs", {
              "text-destructive": task.priority === 1,
              "text-orange-500": task.priority === 2,
              "text-yellow-500": task.priority === 3,
            })}>P{task.priority ?? 4}</span>
          </div>
        {/each}
        {#if groupTasks.length === 0}
          <div class={cn("px-3 py-4 text-center text-sm text-muted-foreground")}>No items</div>
        {/if}
      </div>
    </div>
  {/each}
</div>

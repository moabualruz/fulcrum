<script lang="ts">
  import type { BoardTask } from "$lib/product-queries";
  import { cn } from "$lib/utils.js";
  import { makeBoardCardClick } from "./board-card-handlers.ts";

  interface Props {
    task: BoardTask;
    onEdit?: (taskId: string) => void;
    draggable?: boolean;
  }

  const { task, onEdit, draggable = true }: Props = $props();

  const priorityClass = $derived(
    task.priority >= 4
      ? "border-red-200 bg-red-50 text-red-700"
      : task.priority >= 2
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700",
  );

  const assigneeInitial = $derived(task.assignee?.trim().slice(0, 1).toUpperCase() ?? null);
</script>

<button
  type="button"
  data-board-card
  data-task-id={task.id}
  data-status={task.status}
  data-priority={String(task.priority)}
  data-draggable={draggable ? "true" : "false"}
  aria-label={`Edit task: ${task.title}`}
  onclick={makeBoardCardClick(task.id, onEdit)}
  class={cn(
    "w-full rounded-md border border-border bg-background px-3 py-2 text-left shadow-sm transition hover:bg-muted",
  )}
>
  <span data-board-card-title class="line-clamp-2 block text-sm font-medium leading-snug">{task.title}</span>
  <span class="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
    {#if assigneeInitial}
      <span
        data-board-card-assignee
        class="grid size-5 place-items-center rounded-full border border-border bg-muted text-[10px] font-semibold text-foreground"
        title={task.assignee ?? undefined}
      >{assigneeInitial}</span>
    {/if}
    <span data-board-card-priority class={cn("rounded border px-1.5 py-0.5 font-medium", priorityClass)}>P{task.priority}</span>
    {#each task.labels ?? [] as label (label)}
      <span data-board-card-label class="rounded border border-border bg-muted px-1.5 py-0.5">{label}</span>
    {/each}
    {#if task.project_id}
      <span data-board-card-project aria-hidden="true">·</span>
    {/if}
    {#if task.blocked}
      <span data-board-card-blocked class="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 font-medium text-orange-700">Blocked</span>
    {/if}
    {#if task.points !== null && task.points !== undefined}
      <span data-board-card-points class="rounded border border-border px-1.5 py-0.5">{task.points} pts</span>
    {/if}
  </span>
</button>

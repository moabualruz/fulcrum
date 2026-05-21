<script lang="ts">
  import type { BoardTask } from "$lib/product-queries";
  import { Badge, Card } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";
  import { makeBoardCardClick } from "./board-card-handlers.ts";

  interface Props {
    task: BoardTask;
    onEdit?: (taskId: string) => void;
    draggable?: boolean;
  }

  const { task, onEdit, draggable = true }: Props = $props();
</script>

<Card
  role="button"
  tabindex="0"
  data-board-card
  data-testid="task-card"
  data-task-id={task.id}
  data-status={task.status}
  data-priority={String(task.priority)}
  data-draggable={draggable ? "true" : "false"}
  aria-label={`Edit task: ${task.title}`}
  onclick={makeBoardCardClick(task.id, onEdit)}
  onkeydown={(event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      makeBoardCardClick(task.id, onEdit)();
    }
  }}
  class={cn(
    "w-full rounded-md px-3 py-2 text-left transition hover:bg-muted",
  )}
>
  <span data-board-card-title class="block text-sm font-medium">{task.title}</span>
  <span class="mt-1 flex items-center justify-between text-xs text-muted-foreground">
    <Badge data-board-card-priority variant="outline" size="sm">P{task.priority}</Badge>
    <span data-board-card-assignee>{task.assignee ?? "Unassigned"}</span>
  </span>
  <span class="mt-1 flex items-center justify-between text-xs text-muted-foreground">
    <span data-board-card-due-date>{task.due_date ?? "No due date"}</span>
    <span data-board-card-estimate>{task.estimate == null ? "0pt" : `${task.estimate}pt`}</span>
  </span>
  <span class="mt-1 flex items-center justify-end text-xs text-muted-foreground">
    {#if task.project_id}
      <span data-board-card-project>·</span>
    {/if}
  </span>
</Card>

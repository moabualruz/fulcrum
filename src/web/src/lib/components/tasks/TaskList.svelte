<script lang="ts">
  import { cn } from "$lib/utils.js";
  import type { TaskViewRow } from "./task-view-types";

  interface Props {
    tasks: TaskViewRow[];
    projectId: string;
  }

  const { tasks, projectId }: Props = $props();
</script>

<section
  data-task-list
  data-virtual-item-height="48"
  data-virtual-overscan="5"
  class={cn("flex flex-col overflow-hidden rounded-md border border-border")}
>
  {#each tasks as task (task.id)}
    <a
      data-task-list-row
      data-task-id={task.id}
      data-task-list-link
      href={`/projects/${projectId}/board?task=${task.id}`}
      class={cn("grid min-h-12 grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border px-3 text-sm last:border-b-0 hover:bg-muted/50")}
    >
      <span class={cn("min-w-0 truncate font-medium")}>{task.title}</span>
      <span class={cn("text-xs text-muted-foreground")}>{task.status}</span>
      <span class={cn("text-xs text-muted-foreground")}>P{task.priority}</span>
    </a>
  {/each}
</section>

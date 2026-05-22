<script lang="ts">
  import { cn } from "@fulcrum/ui-kit";

  interface TaskRow {
    id: string;
    title: string;
    status: string;
    priority: number;
    project_id: string | null;
  }

  interface Props {
    tasks: TaskRow[];
  }

  const { tasks }: Props = $props();
</script>

<section data-top-tasks class={cn("space-y-2")}>
  <h3 class={cn("text-sm font-semibold tracking-tight")}>Top tasks</h3>
  {#if tasks.length === 0}
    <div data-top-tasks-empty class={cn("text-sm text-muted-foreground")}>
      No tasks.
    </div>
  {:else}
    <ul class={cn("space-y-1")}>
      {#each tasks as task (task.id)}
        <li
          data-top-task
          data-task-id={task.id}
          class={cn("flex items-center gap-2 text-sm")}
        >
          <span data-priority class={cn("font-mono text-xs font-semibold")}>P{task.priority}</span>
          {task.title}
          <span data-status class={cn("text-muted-foreground")}>{task.status}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

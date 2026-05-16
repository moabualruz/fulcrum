<script lang="ts">
  import { cn } from "$lib/utils.js";

  export interface DependencyTreeTask {
    id: string;
    title: string;
    column: string;
    selected: boolean;
    dependencyDepth: number;
    dependencyIds: string[];
    blockers: string[];
  }

  interface Props {
    tasks: DependencyTreeTask[];
    targetTaskIds: string[];
    warnings?: string[];
    blocked?: boolean;
  }

  const { tasks, targetTaskIds, warnings = [], blocked = false }: Props = $props();

  const targetSet = $derived(new Set(targetTaskIds));

  function columnBadgeClass(column: string): string {
    switch (column) {
      case "done":
      case "in-review":
        return "bg-emerald-100 text-emerald-900";
      case "in-progress":
        return "bg-blue-100 text-blue-900";
      case "todo":
      case "triage":
        return "bg-zinc-100 text-zinc-900";
      case "archived":
        return "bg-orange-100 text-orange-900";
      default:
        return "bg-zinc-100 text-zinc-900";
    }
  }
</script>

<div data-dependency-tree class={cn("rounded-md border border-border bg-muted/20 p-3")}>
  <h3 class={cn("mb-2 text-sm font-semibold")}>Dependency Tree</h3>

  {#if blocked}
    <div
      data-dependency-blocked
      class={cn("mb-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive")}
    >Blocked — resolve issues before dispatching.</div>
  {/if}

  {#if warnings.length > 0}
    <ul data-dependency-warnings class={cn("mb-2 space-y-1")}>
      {#each warnings as warning}
        <li class={cn("text-xs text-amber-700")}>⚠ {warning}</li>
      {/each}
    </ul>
  {/if}

  {#if tasks.length === 0}
    <p class={cn("text-xs text-muted-foreground")}>No tasks in dependency chain.</p>
  {:else}
    <ol data-dependency-task-list class={cn("space-y-1")}>
      {#each tasks as task, index (task.id)}
        {@const isTarget = targetSet.has(task.id)}
        {@const indent = Math.min(task.dependencyDepth, 4)}
        <li
          data-dependency-task
          data-task-id={task.id}
          data-depth={indent}
          data-selected={isTarget}
          class={cn(
            "flex items-center gap-2 rounded px-2 py-1.5 text-xs",
            isTarget ? "bg-primary/10 border border-primary/30" : "bg-background border border-border",
          )}
          style="margin-left: {indent * 1.25}rem"
        >
          <span class={cn("text-muted-foreground font-mono w-5 shrink-0 text-right")}>{index + 1}</span>

          {#if indent > 0}
            <span class={cn("text-muted-foreground")} aria-hidden="true">{"└".padStart(1)}</span>
          {/if}

          <span class={cn("font-medium truncate flex-1", isTarget && "text-primary")}>{task.title}</span>

          <span
            data-column-badge
            class={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-medium shrink-0", columnBadgeClass(task.column))}
          >{task.column}</span>

          {#if task.dependencyIds.length > 0}
            <span class={cn("text-muted-foreground shrink-0")} title="Dependencies">
              {task.dependencyIds.length} dep{task.dependencyIds.length === 1 ? "" : "s"}
            </span>
          {/if}

          {#if task.blockers.length > 0}
            <span class={cn("text-destructive shrink-0")} title={task.blockers.join("; ")}>blocked</span>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</div>

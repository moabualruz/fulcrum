<script lang="ts">
  import type { BoardTask } from "$lib/product-queries";
  import { TASK_STATUSES, describeStatus } from "./board-helpers";
  import { applyBoardMove, buildSwimlanes, filterTasksBySprint, revertBoardMove, type BoardMove, type SwimlaneMode } from "./kanban-board";
  import BoardColumn from "./BoardColumn.svelte";
  import { cn } from "@fulcrum/ui-kit";
  import type { DndMovePayload } from "./board-column-handlers";

  interface SprintOption {
    id: string;
    name: string;
  }

  interface Props {
    projectId: string;
    tasks: BoardTask[];
    activeSprintId?: string | null;
  }

  const { projectId, tasks, activeSprintId = null }: Props = $props();

  let localTasks = $state<BoardTask[]>(tasks.slice());
  let sprintFilter = $state(activeSprintId ?? "all");
  let swimlane = $state<SwimlaneMode>("none");
  let collapsed = $state<Record<string, boolean>>({});

  $effect(() => {
    localTasks = tasks.slice();
  });

  const sprints = $derived(
    Array.from(
      localTasks.reduce((acc, task) => {
        if (task.sprint_id) acc.set(task.sprint_id, { id: task.sprint_id, name: task.sprint_name ?? task.sprint_id });
        return acc;
      }, new Map<string, SprintOption>()),
    ).map(([, value]) => value),
  );
  const filteredTasks = $derived(filterTasksBySprint(localTasks, sprintFilter));
  const lanes = $derived(buildSwimlanes(filteredTasks, swimlane));

  function laneTasks(status: string, laneTasks: BoardTask[]): BoardTask[] {
    return laneTasks.filter((task) => task.status === status);
  }

  async function persistMove(move: BoardMove): Promise<void> {
    const fd = new FormData();
    fd.set("id", move.taskId);
    fd.set("from", move.fromStatus);
    fd.set("to", move.toStatus);
    const response = await fetch("?/move", { method: "POST", body: fd });
    if (!response.ok) throw new Error("Task move failed");
  }

  async function onMove(move: DndMovePayload): Promise<void> {
    localTasks = applyBoardMove(localTasks, move);
    try {
      await persistMove(move);
    } catch (error) {
      localTasks = revertBoardMove(localTasks, move);
      if (typeof window !== "undefined") {
        const { toast } = await import("svelte-sonner");
        toast.error((error as Error).message);
      }
    }
  }
</script>

<section data-kanban-board data-project-id={projectId} class={cn("flex flex-col gap-4")}>
  <header data-board-controls class={cn("flex flex-wrap items-center justify-between gap-3")}>
    <div class={cn("flex items-center gap-2")}>
      <label for="sprint-filter" class={cn("text-sm font-medium")}>Sprint</label>
      <select
        id="sprint-filter"
        data-sprint-filter
        bind:value={sprintFilter}
        class={cn("h-9 rounded-md border border-input bg-background px-3 text-sm")}
      >
        <option value="all">All</option>
        <option value="backlog">Backlog</option>
        {#each sprints as sprint (sprint.id)}
          <option value={sprint.id}>{sprint.name}</option>
        {/each}
      </select>
    </div>
    <div class={cn("flex items-center gap-2")}>
      <label for="swimlane-toggle" class={cn("text-sm font-medium")}>Swimlane</label>
      <select
        id="swimlane-toggle"
        data-swimlane-toggle
        bind:value={swimlane}
        class={cn("h-9 rounded-md border border-input bg-background px-3 text-sm")}
      >
        <option value="none">None</option>
        <option value="assignee">Assignee</option>
        <option value="priority">Priority</option>
        <option value="epic">Epic</option>
      </select>
    </div>
  </header>

  {#each lanes as lane (lane.id)}
    <section data-swimlane data-swimlane-id={lane.id} class={cn("flex flex-col gap-2")}>
      {#if swimlane !== "none"}
        <button
          type="button"
          data-swimlane-collapse
          class={cn("flex items-center justify-between rounded-md border border-border bg-muted px-3 py-2 text-left text-sm font-medium")}
          onclick={() => (collapsed[lane.id] = !collapsed[lane.id])}
        >
          <span>{lane.label}</span>
          <span class={cn("text-xs text-muted-foreground")}>{lane.tasks.length}</span>
        </button>
      {/if}

      {#if !collapsed[lane.id]}
        <div data-board-grid class={cn("grid gap-3 overflow-x-auto pb-2 md:grid-cols-5")}>
          {#each TASK_STATUSES as status (status)}
            <BoardColumn
              {status}
              label={describeStatus(status)}
              tasks={laneTasks(status, lane.tasks)}
              allTasks={filteredTasks}
              {onMove}
            />
          {/each}
        </div>
      {/if}
    </section>
  {/each}
</section>

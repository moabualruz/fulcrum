<script lang="ts">
  import { cn } from "$lib/utils.js";
  import { dndzone, type DndEvent } from "svelte-dnd-action";
  import type { TaskCardTask } from "./TaskCard.svelte";

  interface SprintCapacity {
    totalPoints: number;
    assignedPoints: number;
    remainingPoints: number;
  }

  interface Props {
    projectId: string;
    sprintId: string;
    /** All tasks — tray shows ones with no sprint assigned */
    allTasks: TaskCardTask[];
    onAssign: (taskId: string) => Promise<void>;
  }

  const { projectId, sprintId, allTasks, onAssign }: Props = $props();

  let capacity = $state<SprintCapacity | null>(null);
  let trayItems = $state<TaskCardTask[]>([]);
  let loading = $state(true);

  // Backlog = tasks with no sprint assignment (use tag "backlog" on status as proxy)
  $effect(() => {
    trayItems = allTasks.filter(
      (t) => t.status === "pending" || t.status == null
    );
  });

  $effect(() => {
    void loadCapacity();
  });

  async function loadCapacity() {
    loading = true;
    try {
      const res = await fetch(
        `/api/trpc/sprints.get?input=${encodeURIComponent(JSON.stringify({ id: sprintId }))}`
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        result?: {
          data?: {
            sprint?: { capacityPoints?: number | null };
            assignedPoints?: number;
          };
        };
      };
      const data = json.result?.data;
      if (data) {
        const total = data.sprint?.capacityPoints ?? 0;
        const assigned = data.assignedPoints ?? 0;
        capacity = {
          totalPoints: total,
          assignedPoints: assigned,
          remainingPoints: total - assigned,
        };
      }
    } catch {
      // non-fatal
    } finally {
      loading = false;
    }
  }

  const capPct = $derived(
    capacity && capacity.totalPoints > 0
      ? (capacity.assignedPoints / capacity.totalPoints) * 100
      : 0
  );

  const capColor = $derived(
    capPct > 100
      ? "bg-destructive"
      : capPct >= 80
        ? "bg-yellow-500"
        : "bg-green-500"
  );

  function handleDndConsider(e: CustomEvent<DndEvent<TaskCardTask>>) {
    trayItems = e.detail.items;
  }

  async function handleDndFinalize(e: CustomEvent<DndEvent<TaskCardTask>>) {
    trayItems = e.detail.items;
    // Nothing dropped from tray to here — handled by board
  }

  // When a task is dragged OUT of the tray to the board, the board calls onAssign
  // This component handles drag-from-tray by exposing items as dndzone items
</script>

<aside
  data-sprint-planning-tray
  data-sprint-id={sprintId}
  class="flex w-72 shrink-0 flex-col gap-3 rounded-md border border-border bg-card p-3 overflow-hidden"
>
  <header>
    <h3 class="text-sm font-semibold">Backlog / Sprint Planning</h3>
    <p class="text-xs text-muted-foreground">Drag tasks into the board to assign to sprint</p>
  </header>

  <!-- Capacity bar (D-27) -->
  {#if capacity && capacity.totalPoints > 0}
    <div data-capacity-bar class="flex flex-col gap-1">
      <div class="flex items-center justify-between text-xs">
        <span class="text-muted-foreground">Capacity</span>
        <span
          class={cn(
            "tabular-nums font-medium",
            capPct > 100 ? "text-destructive" : capPct >= 80 ? "text-yellow-600" : "text-green-600"
          )}
        >
          {capacity.assignedPoints}pt / {capacity.totalPoints}pt
        </span>
      </div>
      <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          class={cn("h-full rounded-full transition-all", capColor)}
          style={`width: ${Math.min(capPct, 100).toFixed(1)}%`}
        ></div>
      </div>
    </div>
  {:else if loading}
    <div class="h-6 w-full animate-pulse rounded bg-muted"></div>
  {/if}

  <!-- Backlog task list (draggable) -->
  <div
    data-backlog-dnd-zone
    class="flex flex-1 flex-col gap-2 overflow-y-auto rounded-md border border-dashed border-border p-1 min-h-32"
    use:dndzone={{
      items: trayItems,
      flipDurationMs: 150,
      type: "task-card",
    }}
    onconsider={handleDndConsider}
    onfinalize={handleDndFinalize}
  >
    {#if trayItems.length === 0}
      <div class="flex items-center justify-center h-16 text-xs text-muted-foreground">
        No backlog tasks
      </div>
    {/if}
    {#each trayItems as task (task.id)}
      <div class="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm cursor-grab hover:bg-muted/50">
        <span class="flex-1 line-clamp-1">{task.title}</span>
        {#if task.points != null}
          <span class="shrink-0 text-xs text-muted-foreground">{task.points}pt</span>
        {/if}
        <button
          type="button"
          class="shrink-0 text-xs text-primary hover:underline"
          onclick={() => void onAssign(task.id)}
          title="Add to sprint"
        >+</button>
      </div>
    {/each}
  </div>
</aside>

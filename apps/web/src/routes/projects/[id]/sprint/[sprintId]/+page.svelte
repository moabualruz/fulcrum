<script lang="ts">
  import type { BoardTask } from "$lib/product-queries";
  import { TASK_STATUSES, buildBoardSnapshot, describeStatus } from "$lib/components/board/board-helpers";
  import BoardColumn from "$lib/components/board/BoardColumn.svelte";
  import { cn } from "$lib/utils.js";
  import type { DndMovePayload } from "$lib/components/board/board-column-handlers";

  interface Sprint {
    id: string;
    name: string;
    goal: string | null;
    start_date: string;
    end_date: string;
    status: string;
  }

  interface Props {
    data: {
      project: { id: string; name: string };
      sprint: Sprint;
      tasks: BoardTask[];
    };
  }

  const { data }: Props = $props();

  let localTasks = $state<BoardTask[]>(data.tasks.slice());
  let editingGoal = $state(false);
  let goalText = $state(data.sprint.goal ?? "");
  let showCloseModal = $state(false);

  $effect(() => {
    localTasks = data.tasks.slice();
  });

  // Only sprint-scoped tasks (server already filters, but defensive)
  const sprintTasks = $derived(localTasks.filter((t) => t.sprint_id === data.sprint.id));
  const snapshot = $derived(buildBoardSnapshot(sprintTasks));

  const daysRemaining = $derived(() => {
    const today = new Date();
    const end = new Date(data.sprint.end_date + "T00:00:00Z");
    const diff = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
    return diff;
  });

  const daysLabel = $derived(() => {
    const d = daysRemaining();
    if (d < 0) return `${Math.abs(d)} days overdue`;
    if (d === 0) return "Last day";
    if (d === 1) return "1 day remaining";
    return `${d} days remaining`;
  });

  async function postForm(action: string, fields: Record<string, string>): Promise<Response> {
    const fd = new FormData();
    for (const [k, val] of Object.entries(fields)) fd.set(k, val);
    const res = await fetch(`?/${action}`, { method: "POST", body: fd });
    if (typeof window !== "undefined") {
      const nav = await import("$app/navigation");
      await nav.invalidateAll();
    }
    return res;
  }

  async function onMove(move: DndMovePayload): Promise<void> {
    await postForm("move", { id: move.taskId, from: move.fromStatus, to: move.toStatus });
  }

  async function onQuickAdd(status: string, title: string): Promise<void> {
    await postForm("create", { title, status });
  }

  async function onGoalBlur(): Promise<void> {
    editingGoal = false;
    if (goalText !== (data.sprint.goal ?? "")) {
      await postForm("updateGoal", { goal: goalText });
    }
  }

  async function closeSprint(): Promise<void> {
    await postForm("closeSprint", {});
    showCloseModal = false;
    if (typeof window !== "undefined") {
      const nav = await import("$app/navigation");
      await nav.goto(`/projects/${data.project.id}/board`);
    }
  }
</script>

<div class={cn("flex flex-col gap-4")}>
  <header class={cn("flex flex-wrap items-end justify-between gap-3")}>
    <div>
      <a href="/projects/{data.project.id}/board" class={cn("text-sm text-muted-foreground hover:underline")}>← Board</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>{data.sprint.name}</h1>
    </div>
  </header>

  <!-- Sprint header bar -->
  <div data-sprint-header class={cn("flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/50 p-4")}>
    <!-- Goal (editable in-place) -->
    <div class={cn("flex-1")}>
      {#if editingGoal}
        <input
          data-sprint-goal-input
          type="text"
          bind:value={goalText}
          onblur={onGoalBlur}
          class={cn("w-full rounded border border-input bg-background px-2 py-1 text-sm")}
        />
      {:else}
        <button
          data-sprint-goal
          type="button"
          onclick={() => { editingGoal = true; }}
          class={cn("text-sm text-left hover:underline")}
          title="Click to edit goal"
        >
          {data.sprint.goal || "No goal set: click to add"}
        </button>
      {/if}
    </div>

    <!-- Date range -->
    <span class={cn("text-xs text-muted-foreground")}>{data.sprint.start_date}: {data.sprint.end_date}</span>

    <!-- Days remaining chip -->
    <span
      data-days-remaining
      class={cn("rounded-full px-2 py-0.5 text-xs font-medium", daysRemaining() < 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}
    >
      {daysLabel()}
    </span>

    <!-- Close sprint button -->
    {#if data.sprint.status === "active"}
      <button
        data-close-sprint
        type="button"
        onclick={() => { showCloseModal = true; }}
        class={cn("rounded-md border border-border bg-background px-3 py-1 text-sm hover:bg-muted")}
      >
        Close sprint
      </button>
    {/if}
  </div>

  <!-- Kanban columns -->
  <div data-board-grid class={cn("flex gap-3 overflow-x-auto pb-2")}>
    {#each TASK_STATUSES as status (status)}
      <BoardColumn
        {status}
        label={describeStatus(status)}
        tasks={snapshot.groups[status]}
        allTasks={sprintTasks}
        {onMove}
        onCreate={(title) => onQuickAdd(status, title)}
      />
    {/each}
  </div>

  <!-- Quick-add markers for test discovery -->
  {#each TASK_STATUSES as status (status)}
    <input type="hidden" data-quick-add data-quick-add-status={status} />
  {/each}

  <!-- Close sprint modal -->
  {#if showCloseModal}
    <div data-close-sprint-modal class={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/50")}>
      <div class={cn("w-96 rounded-lg bg-background p-6 shadow-xl")}>
        <h2 class={cn("text-lg font-semibold")}>Close sprint</h2>
        <p class={cn("mt-2 text-sm text-muted-foreground")}>
          Incomplete tasks will be moved to the backlog.
        </p>
        <div class={cn("mt-4 flex justify-end gap-2")}>
          <button
            type="button"
            onclick={() => { showCloseModal = false; }}
            class={cn("rounded-md border border-border px-3 py-1 text-sm")}
          >
            Cancel
          </button>
          <button
            data-confirm-close
            type="button"
            onclick={closeSprint}
            class={cn("rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground")}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

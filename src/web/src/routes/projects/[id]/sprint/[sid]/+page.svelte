<script lang="ts">
  import type { BacklogTask } from "$lib/product-queries";
  import type { TaskStatus } from "$lib/server/tasks";
  import {
    TASK_STATUSES,
    buildBoardSnapshot,
    describeStatus,
  } from "$lib/components/board/board-helpers";
  import BoardColumn from "$lib/components/board/BoardColumn.svelte";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import type { DndMovePayload } from "$lib/components/board/board-column-handlers";
  import { cn } from "$lib/utils.js";

  interface SprintData {
    id: string;
    name: string;
    goal: string | null;
    status: string;
    capacity: number;
    start_date: string | null;
    end_date: string | null;
    project_id: string;
  }

  interface Props {
    data: {
      projectId: string;
      sprint: SprintData;
      streamed: {
        data: Promise<{ tasks: BacklogTask[] }> | { tasks: BacklogTask[] };
      };
    };
  }
  const { data }: Props = $props();

  let resolvedTasks = $state<BacklogTask[]>([]);

  {
    const d = data.streamed.data;
    if (!(d instanceof Promise)) resolvedTasks = d.tasks;
  }

  $effect(() => {
    const d = data.streamed.data;
    if (d instanceof Promise) {
      let cancelled = false;
      void d.then((p) => { if (!cancelled) resolvedTasks = p.tasks; });
      return () => { cancelled = true; };
    } else {
      resolvedTasks = d.tasks;
    }
  });

  const snapshot = $derived(buildBoardSnapshot(resolvedTasks));

  // Days remaining
  const daysRemaining = $derived(() => {
    if (!data.sprint.end_date) return null;
    const end = new Date(data.sprint.end_date);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
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
  async function onCreate(status: TaskStatus, title: string): Promise<void> {
    await postForm("create", { title, status });
  }
</script>

<header data-sprint-board-header class={cn("flex items-center justify-between border-b border-border pb-3 mb-4")}>
  <div class={cn("flex items-baseline gap-3")}>
    <a href="/projects/{data.projectId}/sprints" class={cn("text-sm text-muted-foreground hover:underline")}>← Sprints</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>{data.sprint.name}</h1>
    {#if data.sprint.status === "active"}
      <span class={cn("rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5 text-xs text-primary")}>Active</span>
    {/if}
  </div>
  <div class={cn("flex items-center gap-4")}>
    {#if daysRemaining() !== null}
      <span data-days-remaining class={cn("text-sm font-medium", (daysRemaining() ?? 0) <= 2 ? "text-destructive" : "text-muted-foreground")}>
        {daysRemaining()} day{daysRemaining() === 1 ? "" : "s"} remaining
      </span>
    {/if}
  </div>
</header>

{#if data.sprint.goal}
  <p class={cn("mb-4 text-sm text-muted-foreground")}>{data.sprint.goal}</p>
{/if}

{#await data.streamed.data}
  <RouteSkeleton kind="board" />
{:then _payload}
  <!-- Inline quick-add -->
  <form method="POST" action="?/create" class={cn("mb-4 flex gap-2 max-w-md")} data-sprint-quick-add>
    <input
      name="title"
      type="text"
      placeholder="Quick-add task to sprint…"
      required
      class={cn("border-input bg-background h-9 flex-1 rounded-md border px-3 py-1 text-sm shadow-xs")}
    />
    <button
      type="submit"
      class={cn("bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium shadow-xs")}
    >Add</button>
  </form>

  <div data-sprint-board-grid class={cn("flex gap-3 overflow-x-auto pb-2")} role="presentation">
    {#each TASK_STATUSES as status (status)}
      <BoardColumn
        {status}
        label={describeStatus(status)}
        tasks={snapshot.groups[status]}
        allTasks={resolvedTasks}
        onCardEdit={() => {}}
        onMove={onMove}
        onCreate={(title) => onCreate(status, title)}
      />
    {/each}
  </div>
{/await}

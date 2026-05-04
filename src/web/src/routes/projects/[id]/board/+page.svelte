<script lang="ts">
  import type { BoardTask } from "$lib/product-queries";
  import type { TaskStatus } from "$lib/server/tasks";
  import {
    TASK_STATUSES,
    buildBoardSnapshot,
    describeStatus,
    keyboardMove,
  } from "$lib/components/board/board-helpers";
  import BoardColumn from "$lib/components/board/BoardColumn.svelte";
  import BoardSheet from "$lib/components/board/BoardSheet.svelte";
  import KeyboardMoveAnnouncer from "$lib/components/board/KeyboardMoveAnnouncer.svelte";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import type { DndMovePayload } from "$lib/components/board/board-column-handlers";

  interface Props {
    data: {
      projectId: string;
      sprintFilter: string;
      streamed: { data: Promise<{ tasks: BoardTask[] }> | { tasks: BoardTask[] } };
    };
  }
  const { data }: Props = $props();

  let resolvedTasks = $state<BoardTask[]>([]);
  let swimlane = $state<"none" | "assignee" | "label">("none");

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
    }
    resolvedTasks = d.tasks;
  });

  let sheetOpen = $state(false);
  let selectedTask = $state<BoardTask | null>(null);
  let announcement = $state<string | null>(null);

  const snapshot = $derived(buildBoardSnapshot(resolvedTasks));
  const swimlaneLabel = $derived(swimlane === "none" ? "All tasks" : swimlane === "assignee" ? "By assignee" : "By label");

  function openSheet(taskId: string): void {
    const task = resolvedTasks.find((t) => t.id === taskId) ?? null;
    selectedTask = task;
    sheetOpen = task !== null;
  }
  function closeSheet(): void { sheetOpen = false; selectedTask = null; }

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
  async function onSave(input: {
    id: string; title: string; status: TaskStatus; priority: number; description: string | null;
  }): Promise<void> {
    await postForm("update", {
      id: input.id, title: input.title, status: input.status,
      priority: String(input.priority), description: input.description ?? "",
    });
    closeSheet();
  }
  async function onDelete(id: string): Promise<void> {
    await postForm("delete", { id });
    closeSheet();
  }

  function onCardKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const taskId = target?.closest<HTMLElement>("[data-task-id]")?.dataset["taskId"] ?? null;
    if (!taskId) return;
    const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
    if (!(arrows as readonly string[]).includes(event.key)) return;
    const result = keyboardMove(snapshot, taskId, {
      key: event.key as (typeof arrows)[number],
      withMod: event.metaKey || event.ctrlKey,
    });
    if (result.description) { announcement = result.description; event.preventDefault(); }
  }
</script>

<header data-project-board-header class="mb-3 flex flex-wrap items-center justify-between gap-3">
  <div>
    <a href={`/projects/${data.projectId}`} class="text-sm text-muted-foreground hover:underline">Project overview</a>
    <h1 class="text-2xl font-semibold tracking-tight">Board</h1>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <label class="text-sm text-muted-foreground">
      Swimlane
      <select
        data-swimlane-toggle
        bind:value={swimlane}
        class="border-input bg-background ml-2 h-9 rounded-md border px-3 py-1 text-sm shadow-xs"
      >
        <option value="none">None</option>
        <option value="assignee">Assignee</option>
        <option value="label">Label</option>
      </select>
    </label>
    <span data-swimlane-label class="rounded-md border border-border px-2 py-1 text-xs">{swimlaneLabel}</span>
    <span data-sprint-filter-chip class="rounded-md border border-border px-2 py-1 text-xs">
      Sprint: {data.sprintFilter || "All"}
    </span>
    <a href={`/projects/${data.projectId}/board`} class="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">All</a>
  </div>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="board" />
{:then _payload}
  <div data-project-board-grid class="flex gap-3 overflow-x-auto pb-2" onkeydown={onCardKeydown} role="presentation">
    {#each TASK_STATUSES as status (status)}
      <BoardColumn
        {status}
        label={describeStatus(status)}
        tasks={snapshot.groups[status]}
        allTasks={resolvedTasks}
        onCardEdit={openSheet}
        onMove={onMove}
        onCreate={(title) => onCreate(status, title)}
      />
    {/each}
  </div>

  <BoardSheet open={sheetOpen} task={selectedTask} {onSave} {onDelete} onClose={closeSheet} />
  <KeyboardMoveAnnouncer message={announcement} />
{/await}

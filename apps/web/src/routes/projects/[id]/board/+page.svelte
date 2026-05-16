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
  import DependencyTree from "$lib/components/board/DependencyTree.svelte";
  import type { DependencyTreeTask } from "$lib/components/board/DependencyTree.svelte";
  import type { DndMovePayload } from "$lib/components/board/board-column-handlers";

  type ManualWorkbenchPayload = {
    traceId?: string;
    layout: string;
    filtersApplied: number;
    columns: Array<{ group: string; label: string; count: number }>;
    listRows: Array<{ id: string; title: string; stateLabel: string; traceId?: string }>;
  };

  type BoardPayload = {
    tasks: BoardTask[];
    manualWorkbench?: ManualWorkbenchPayload;
  };

  interface Props {
    data: {
      projectId: string;
      sprintFilter: string;
      streamed: { data: Promise<BoardPayload> | BoardPayload };
    };
  }
  const { data }: Props = $props();

  let resolvedTasks = $state<BoardTask[]>([]);
  let manualWorkbench = $state<ManualWorkbenchPayload | null>(null);
  let swimlane = $state<"none" | "assignee" | "label">("none");

  {
    const d = data.streamed.data;
    if (!(d instanceof Promise)) {
      resolvedTasks = d.tasks;
      manualWorkbench = d.manualWorkbench ?? null;
    }
  }

  $effect(() => {
    const d = data.streamed.data;
    if (d instanceof Promise) {
      let cancelled = false;
      void d.then((p) => {
        if (!cancelled) {
          resolvedTasks = p.tasks;
          manualWorkbench = p.manualWorkbench ?? null;
        }
      });
      return () => { cancelled = true; };
    }
    resolvedTasks = d.tasks;
    manualWorkbench = d.manualWorkbench ?? null;
  });

  let sheetOpen = $state(false);
  let selectedTask = $state<BoardTask | null>(null);
  let announcement = $state<string | null>(null);

  let runPreviewOpen = $state(false);
  let runPreviewTaskId = $state<string | null>(null);
  let runPreviewTasks = $state<DependencyTreeTask[]>([]);
  let runPreviewTargetIds = $state<string[]>([]);
  let runPreviewWarnings = $state<string[]>([]);
  let runPreviewBlocked = $state(false);
  let runPreviewLoading = $state(false);
  let runDispatchLoading = $state(false);

  async function openRunPreview(taskId: string): Promise<void> {
    runPreviewTaskId = taskId;
    runPreviewLoading = true;
    runPreviewOpen = true;
    try {
      const res = await postForm("runPreview", { taskIds: taskId });
      const result = await res.json();
      if (result.type === "success" && result.data?.preview) {
        const preview = result.data.preview;
        runPreviewTasks = preview.tasks ?? [];
        runPreviewTargetIds = preview.targetTaskIds ?? [taskId];
        runPreviewWarnings = preview.warnings ?? [];
        runPreviewBlocked = preview.blocked ?? false;
      } else {
        runPreviewWarnings = [result.data?.message ?? "Failed to load preview"];
        runPreviewBlocked = true;
      }
    } catch {
      runPreviewWarnings = ["Failed to load dependency preview"];
      runPreviewBlocked = true;
    } finally {
      runPreviewLoading = false;
    }
  }

  function closeRunPreview(): void {
    runPreviewOpen = false;
    runPreviewTaskId = null;
    runPreviewTasks = [];
    runPreviewTargetIds = [];
    runPreviewWarnings = [];
    runPreviewBlocked = false;
  }

  async function confirmRunDispatch(): Promise<void> {
    if (!runPreviewTaskId || runPreviewBlocked) return;
    runDispatchLoading = true;
    try {
      await postForm("run", { taskIds: runPreviewTaskId, agent: "codex" });
      closeRunPreview();
    } finally {
      runDispatchLoading = false;
    }
  }

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

  function tasksFromSnapshot(next: typeof snapshot): BoardTask[] {
    return TASK_STATUSES.flatMap((status) => next.groups[status]);
  }

  async function onCardKeydown(event: KeyboardEvent): Promise<void> {
    const target = event.target as HTMLElement | null;
    const taskId = target?.closest<HTMLElement>("[data-task-id]")?.dataset["taskId"] ?? null;
    if (!taskId) return;
    const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
    if (!(arrows as readonly string[]).includes(event.key)) return;
    const fromStatus = TASK_STATUSES.find((status) =>
      snapshot.groups[status].some((task) => task.id === taskId),
    );
    const result = keyboardMove(snapshot, taskId, {
      key: event.key as (typeof arrows)[number],
      withMod: event.metaKey || event.ctrlKey,
    });
    if (!result.description) return;
    announcement = result.description;
    event.preventDefault();
    resolvedTasks = tasksFromSnapshot(result.next);
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && fromStatus) {
      const toStatus = TASK_STATUSES.find((status) =>
        result.next.groups[status].some((task) => task.id === taskId),
      );
      if (toStatus && toStatus !== fromStatus) await onMove({ taskId, fromStatus, toStatus });
    }
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

{#if manualWorkbench}
  <section data-manual-workbench class="mb-3 rounded-md border border-border bg-muted/20 p-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-sm font-semibold">manual task workbench</h2>
        <p class="text-xs text-muted-foreground">
          Layout: {manualWorkbench.layout} - Trace: {manualWorkbench.traceId ?? "none"} - Filters: {manualWorkbench.filtersApplied}
        </p>
      </div>
    </div>
    <div class="mt-2 flex flex-wrap gap-2">
      {#each manualWorkbench.columns as column (column.group)}
        <span class="rounded border border-border px-2 py-1 text-xs">{column.label}: {column.count}</span>
      {/each}
    </div>
    {#if manualWorkbench.listRows.length > 0}
      <ul class="mt-2 space-y-1 text-xs">
        {#each manualWorkbench.listRows.slice(0, 5) as row (row.id)}
          <li>{row.title} - {row.stateLabel}</li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

{#await data.streamed.data}
  <RouteSkeleton kind="board" />
{:then _payload}
  <div
    data-project-board-grid
    data-testid="kanban-board"
    class="flex gap-3 overflow-x-auto pb-2"
    onkeydown={onCardKeydown}
    role="presentation"
  >
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

  <BoardSheet open={sheetOpen} task={selectedTask} {onSave} {onDelete} onRun={(id) => { closeSheet(); openRunPreview(id); }} onClose={closeSheet} />

  {#if runPreviewOpen}
    <div
      data-run-preview-overlay
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Run dependency preview"
    >
      <div class="w-full max-w-lg rounded-lg border border-border bg-background p-5 shadow-lg">
        <header class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-semibold">Run Preview</h2>
          <button type="button" onclick={closeRunPreview} class="text-muted-foreground hover:text-foreground" aria-label="close">×</button>
        </header>

        {#if runPreviewLoading}
          <p class="text-sm text-muted-foreground">Loading dependency tree...</p>
        {:else}
          <DependencyTree
            tasks={runPreviewTasks}
            targetTaskIds={runPreviewTargetIds}
            warnings={runPreviewWarnings}
            blocked={runPreviewBlocked}
          />

          <footer class="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onclick={closeRunPreview}
              class="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
            >Cancel</button>
            <button
              type="button"
              data-run-dispatch-confirm
              disabled={runPreviewBlocked || runDispatchLoading}
              onclick={confirmRunDispatch}
              class="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >{runDispatchLoading ? "Dispatching..." : "Dispatch Run"}</button>
          </footer>
        {/if}
      </div>
    </div>
  {/if}

  <KeyboardMoveAnnouncer message={announcement} />
{/await}

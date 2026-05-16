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
  import ListView from "$lib/components/board/ListView.svelte";
  import SpreadsheetView from "$lib/components/board/SpreadsheetView.svelte";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import type { DndMovePayload } from "$lib/components/board/board-column-handlers";
  import { page } from "$app/state";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: {
      project: string;
      activeProjectId: string | null;
      streamed: { data: Promise<{ tasks: BoardTask[] }> | { tasks: BoardTask[] } };
    };
  }
  const { data }: Props = $props();

  type ViewMode = "board" | "list" | "spreadsheet";
  let viewMode = $state<ViewMode>(
    (page.url.searchParams.get("view") as ViewMode) || "board"
  );

  let resolvedTasks = $state<BoardTask[]>([]);

  // SSR-friendly synchronous unwrap: when the loader passes a resolved
  // object (test fixtures + SSR'd payload), populate immediately. When it
  // passes a Promise (real navigation), wait for resolution.
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

  let sheetOpen = $state(false);
  let selectedTask = $state<BoardTask | null>(null);
  let announcement = $state<string | null>(null);

  const snapshot = $derived(buildBoardSnapshot(resolvedTasks));
  const distinctProjects = $derived(
    Array.from(new Set(resolvedTasks.map((t) => t.project_id).filter((p): p is string => !!p))).sort(),
  );

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
    const fields: Record<string, string> = { title, status };
    if (data.project) fields["projectId"] = data.project;
    await postForm("create", fields);
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

<header data-board-header class="mb-3 flex items-center justify-between">
  <h1 class="text-2xl font-semibold tracking-tight">Board</h1>
  <nav data-view-switcher class={cn("flex items-center gap-1 rounded-md border border-border p-0.5")} aria-label="View mode">
    {#each [
      { id: "board", label: "Board", icon: "▦" },
      { id: "list", label: "List", icon: "☰" },
      { id: "spreadsheet", label: "Table", icon: "▤" },
    ] as view (view.id)}
      <button
        type="button"
        data-view={view.id}
        class={cn(
          "rounded px-2.5 py-1 text-xs font-medium transition-colors",
          viewMode === view.id
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}
        onclick={() => { viewMode = view.id as ViewMode; }}
        aria-pressed={viewMode === view.id}
      >{view.icon} {view.label}</button>
    {/each}
  </nav>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="board" />
{:then _payload}
  <header class="mb-3 flex items-center justify-end">
    <form method="GET" class="flex items-center gap-2">
      <select
        data-board-project-filter
        name="project"
        aria-label="Filter board by project"
        onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit()}
        class="border-input bg-background h-9 rounded-md border px-3 py-1 text-sm shadow-xs"
      >
        <option value="" selected={data.project === ""}>All</option>
        {#each distinctProjects as projectId (projectId)}
          <option value={projectId} selected={data.project === projectId}>{projectId}</option>
        {/each}
      </select>
    </form>
  </header>

  {#if viewMode === "board"}
    <div data-board-grid class="flex gap-3 overflow-x-auto pb-2" onkeydown={onCardKeydown} role="presentation">
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
  {:else if viewMode === "list"}
    <ListView
      tasks={resolvedTasks}
      onEdit={openSheet}
      onStatusChange={(taskId, status) => onMove({ taskId, fromStatus: "todo", toStatus: status })}
    />
  {:else if viewMode === "spreadsheet"}
    <SpreadsheetView
      tasks={resolvedTasks}
      onEdit={openSheet}
      onStatusChange={(taskId, status) => onMove({ taskId, fromStatus: "todo", toStatus: status })}
    />
  {/if}

  <BoardSheet open={sheetOpen} task={selectedTask} {onSave} {onDelete} onClose={closeSheet} />
  <KeyboardMoveAnnouncer message={announcement} />
{/await}

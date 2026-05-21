<script lang="ts">
  interface BacklogTaskItem {
    id: string;
    title: string;
    status: string;
    priority: number;
    estimate_points: number | null;
    sprint_id: string | null;
  }

  interface SprintItem {
    id: string;
    name: string;
    status: string;
    capacity_points: number | null;
  }

  interface Props {
    data: {
      project: { id: string; name: string };
      sprints: SprintItem[];
      backlogTasks: BacklogTaskItem[];
    };
  }
  const { data }: Props = $props();

  let selectedSprintId = $state<string | null>(
    data.sprints[0]?.id ?? null,
  );

  // Sprint tasks loaded via form action response; start empty
  let sprintTasks = $state<BacklogTaskItem[]>([]);
  let backlogItems = $state<BacklogTaskItem[]>(data.backlogTasks.slice());

  // Sync from data prop changes
  $effect(() => {
    backlogItems = data.backlogTasks.slice();
  });

  const selectedSprint = $derived(
    data.sprints.find((s) => s.id === selectedSprintId) ?? null,
  );

  const capacityUsed = $derived(
    sprintTasks.reduce((sum, t) => sum + (t.estimate_points ?? 0), 0),
  );
  const capacityTotal = $derived(selectedSprint?.capacity_points ?? null);
  const capacityPercent = $derived(
    capacityTotal != null && capacityTotal > 0
      ? Math.round((capacityUsed / capacityTotal) * 100)
      : null,
  );
  const overCapacity = $derived(
    capacityTotal != null && capacityUsed > capacityTotal,
  );
  const nearCapacity = $derived(
    capacityTotal != null && !overCapacity && capacityPercent != null && capacityPercent > 80,
  );

  // Filter state for backlog
  let filterPriority = $state<string>("");

  const filteredBacklog = $derived(
    filterPriority
      ? backlogItems.filter((t) => String(t.priority) === filterPriority)
      : backlogItems,
  );

  // DnD: lazy-load svelte-dnd-action
  type DndAction = (
    node: HTMLElement,
    options: { items: BacklogTaskItem[]; type: string; flipDurationMs?: number },
  ) => { update?: (o: unknown) => void; destroy?: () => void };
  let dndzone = $state<DndAction | null>(null);
  if (typeof window !== "undefined") {
    void import("svelte-dnd-action").then((m) => {
      dndzone = m.dndzone as DndAction;
    });
  }

  async function postAction(action: string, fields: Record<string, string>): Promise<void> {
    const fd = new FormData();
    for (const [k, val] of Object.entries(fields)) fd.set(k, val);
    await fetch(`?/${action}`, { method: "POST", body: fd });
    if (typeof window !== "undefined") {
      const nav = await import("$app/navigation");
      await nav.invalidateAll();
    }
  }

  async function moveToSprint(taskId: string): Promise<void> {
    if (!selectedSprintId) return;
    // Optimistic: move from backlog to sprint pane
    const idx = backlogItems.findIndex((t) => t.id === taskId);
    if (idx === -1) return;
    const [task] = backlogItems.splice(idx, 1);
    sprintTasks = [...sprintTasks, { ...task!, sprint_id: selectedSprintId }];
    backlogItems = backlogItems.slice();
    await postAction("addTask", { sprintId: selectedSprintId, taskId });
  }

  async function moveToBacklog(taskId: string): Promise<void> {
    if (!selectedSprintId) return;
    const idx = sprintTasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return;
    const [task] = sprintTasks.splice(idx, 1);
    backlogItems = [...backlogItems, { ...task!, sprint_id: null }];
    sprintTasks = sprintTasks.slice();
    await postAction("removeTask", { sprintId: selectedSprintId, taskId });
  }

  function onBacklogConsider(event: { detail: { items: BacklogTaskItem[] } }) {
    backlogItems = event.detail.items;
  }
  function onBacklogFinalize(event: { detail: { items: BacklogTaskItem[] } }) {
    // Check if a sprint task landed here
    const prev = new Set(data.backlogTasks.map((t) => t.id));
    for (const item of event.detail.items) {
      if (!prev.has(item.id) && item.sprint_id) {
        void moveToBacklog(item.id);
        return;
      }
    }
    backlogItems = event.detail.items;
  }
  function onSprintConsider(event: { detail: { items: BacklogTaskItem[] } }) {
    sprintTasks = event.detail.items;
  }
  function onSprintFinalize(event: { detail: { items: BacklogTaskItem[] } }) {
    // Check if a backlog task landed here
    const prev = new Set(sprintTasks.map((t) => t.id));
    for (const item of event.detail.items) {
      if (!prev.has(item.id) && !item.sprint_id) {
        void moveToSprint(item.id);
        return;
      }
    }
    sprintTasks = event.detail.items;
  }
</script>

<header class="mb-4 flex items-center justify-between">
  <h1 class="text-2xl font-semibold tracking-tight">
    {data.project.name}: Sprint Planning
  </h1>
  {#if data.sprints.length > 0}
    <select
      data-sprint-selector
      bind:value={selectedSprintId}
      aria-label="Select sprint"
      class="border-input bg-background h-9 rounded-md border px-3 py-1 text-sm shadow-xs"
    >
      {#each data.sprints as sprint (sprint.id)}
        <option value={sprint.id}>{sprint.name}</option>
      {/each}
    </select>
  {/if}
</header>

<div data-backlog-grid class="grid grid-cols-2 gap-4" style="min-height: 400px;">
  <!-- Left: Backlog pane -->
  <section data-backlog-pane aria-label="Backlog">
    <header class="mb-2 flex items-center justify-between">
      <h2 class="text-lg font-medium">Backlog</h2>
      <select
        data-priority-filter
        bind:value={filterPriority}
        aria-label="Filter by priority"
        class="border-input bg-background h-8 rounded border px-2 text-xs"
      >
        <option value="">All priorities</option>
        <option value="10">High (10)</option>
        <option value="5">Medium (5)</option>
        <option value="0">Low (0)</option>
      </select>
    </header>
    <div
      data-backlog-list
      class="min-h-[200px] rounded-md border p-2"
      role="list"
      aria-label="Backlog tasks"
      use:dndzone={{ items: filteredBacklog, type: "planning", flipDurationMs: 150 }}
      onconsider={onBacklogConsider}
      onfinalize={onBacklogFinalize}
    >
      {#each filteredBacklog as task (task.id)}
        <div
          data-task-id={task.id}
          data-backlog-card
          class="mb-1 cursor-grab rounded border bg-white p-2 text-sm shadow-xs"
          role="listitem"
        >
          <div class="flex items-center justify-between">
            <span>{task.title}</span>
            <span class="text-muted-foreground text-xs">P{task.priority}</span>
          </div>
          {#if task.estimate_points != null}
            <span class="text-muted-foreground text-xs">{task.estimate_points}pt</span>
          {/if}
          {#if selectedSprintId}
            <button
              data-move-to-sprint
              onclick={() => moveToSprint(task.id)}
              class="ml-2 text-xs text-blue-600 hover:underline"
              aria-label="Move to sprint"
            >→ Sprint</button>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- Right: Sprint pane -->
  <section data-sprint-pane aria-label="Sprint">
    <header class="mb-2">
      <h2 class="text-lg font-medium">
        {selectedSprint?.name ?? "No sprint selected"}
      </h2>
      {#if selectedSprint && capacityTotal != null}
        <div data-capacity-bar class="mt-1" aria-label="Sprint capacity">
          <div class="flex items-center gap-2 text-xs">
            <span>{capacityUsed} / {capacityTotal} points</span>
            {#if overCapacity}
              <span data-over-capacity class="rounded bg-red-100 px-1.5 py-0.5 text-red-700 font-medium">Over capacity</span>
            {/if}
          </div>
          <div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              data-capacity-fill
              class="h-full rounded-full transition-all {overCapacity ? 'bg-red-500' : nearCapacity ? 'bg-amber-400' : 'bg-green-500'}"
              style="width: {Math.min(capacityPercent ?? 0, 100)}%"
            ></div>
          </div>
        </div>
      {/if}
    </header>
    <div
      data-sprint-list
      class="min-h-[200px] rounded-md border p-2"
      role="list"
      aria-label="Sprint tasks"
      use:dndzone={{ items: sprintTasks, type: "planning", flipDurationMs: 150 }}
      onconsider={onSprintConsider}
      onfinalize={onSprintFinalize}
    >
      {#each sprintTasks as task (task.id)}
        <div
          data-task-id={task.id}
          data-sprint-card
          class="mb-1 cursor-grab rounded border bg-white p-2 text-sm shadow-xs"
          role="listitem"
        >
          <div class="flex items-center justify-between">
            <span>{task.title}</span>
            <span class="text-muted-foreground text-xs">P{task.priority}</span>
          </div>
          {#if task.estimate_points != null}
            <span class="text-muted-foreground text-xs">{task.estimate_points}pt</span>
          {/if}
          <button
            data-move-to-backlog
            onclick={() => moveToBacklog(task.id)}
            class="ml-2 text-xs text-blue-600 hover:underline"
            aria-label="Move to backlog"
          >← Backlog</button>
        </div>
      {/each}
    </div>
  </section>
</div>

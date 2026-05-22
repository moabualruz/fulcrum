<script lang="ts">
  import { cn, Select } from "@fulcrum/ui-kit";
  import { dndzone, type DndEvent } from "svelte-dnd-action";
  import TaskCard, { type TaskCardTask } from "./TaskCard.svelte";
  import WipLimitIndicator from "./WipLimitIndicator.svelte";
  import SprintPlanningTray from "./SprintPlanningTray.svelte";
  import { createQuickTask } from "./quick-create-api";
  import { fetchTaskList, updateTaskListFields, type TaskListRow } from "./task-list-api";
  import { assignTaskToSprint, listProjectSprints } from "./sprint-planning-api";

  type GroupByField = "status" | "assignee" | "priority" | "label" | "sprint";
  type Density = "compact" | "comfortable";
  type Methodology = "scrum" | "kanban" | "none";
  type TypeFilter = "all" | "epic" | "task" | "bug";

  interface Column {
    id: string;
    label: string;
    wipLimit?: number;
    items: TaskCardTask[];
  }

  interface Props {
    projectId: string;
    orgId?: string;
    currentUserId?: string;
    sprintId?: string;
    groupBy?: GroupByField;
    methodology?: Methodology;
  }

  const { projectId, orgId = "", currentUserId = "", sprintId, groupBy = "status", methodology = "none" }: Props = $props();

  let density = $state<Density>("compact");
  let typeFilter = $state<TypeFilter>("all");
  let myWorkOnly = $state(false);
  let showTray = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let rawTasks = $state<TaskCardTask[]>([]);
  let wipLimits = $state<Record<string, number>>({});
  let currentSprints = $state<Array<{ id: string; name: string }>>([]);
  let selectedSprintId = $state<string | undefined>(sprintId);

  let quickCreateColumn = $state<string | null>(null);
  let quickCreateTitle = $state("");

  const filteredTasks = $derived(() => {
    let tasks = rawTasks;
    if (typeFilter !== "all") {
      tasks = tasks.filter((t) => t.taskType === typeFilter);
    }
    if (myWorkOnly) {
      tasks = tasks.filter((t) => t.assignee === currentUser);
    }
    return tasks;
  });

  let currentUser: string | undefined = currentUserId || undefined;

  const columns = $derived(() => buildColumns(filteredTasks(), groupBy, wipLimits, methodology));

  function buildColumns(
    tasks: TaskCardTask[],
    by: GroupByField,
    limits: Record<string, number>,
    meth: Methodology
  ): Column[] {
    if (by === "status" || by === "sprint") {
      const statuses = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"];
      return statuses.map((s) => ({
        id: s,
        label: s.replace("_", " "),
        wipLimit: limits[s],
        items: tasks.filter((t) => (t.status ?? "pending") === s),
      }));
    }

    if (by === "priority") {
      return [
        { id: "4", label: "Urgent", wipLimit: limits["4"], items: tasks.filter((t) => t.priority === 4) },
        { id: "3", label: "High", wipLimit: limits["3"], items: tasks.filter((t) => t.priority === 3) },
        { id: "2", label: "Medium", wipLimit: limits["2"], items: tasks.filter((t) => t.priority === 2) },
        { id: "1", label: "Low", wipLimit: limits["1"], items: tasks.filter((t) => t.priority === 1) },
        { id: "0", label: "None", wipLimit: limits["0"], items: tasks.filter((t) => !t.priority) },
      ];
    }

    if (by === "assignee") {
      const assignees = [...new Set(tasks.map((t) => t.assignee ?? "Unassigned"))];
      return assignees.map((a) => ({
        id: a,
        label: a,
        wipLimit: limits[a],
        items: tasks.filter((t) => (t.assignee ?? "Unassigned") === a),
      }));
    }

    if (by === "label") {
      const labels = [...new Set(tasks.flatMap((t) => t.labels ?? []))];
      const withLabel = labels.map((l) => ({
        id: l,
        label: l,
        wipLimit: limits[l],
        items: tasks.filter((t) => t.labels?.includes(l)),
      }));
      const unlabeled = tasks.filter((t) => !t.labels || t.labels.length === 0);
      if (unlabeled.length > 0) {
        withLabel.push({ id: "__none", label: "No label", wipLimit: undefined, items: unlabeled });
      }
      return withLabel;
    }

    return [];
  }

  function handleDndConsider(colId: string, e: CustomEvent<DndEvent<TaskCardTask>>) {
    const col = columns().find((c) => c.id === colId);
    if (col) col.items = e.detail.items;
  }

  async function handleDndFinalize(colId: string, e: CustomEvent<DndEvent<TaskCardTask>>) {
    const col = columns().find((c) => c.id === colId);
    if (col) col.items = e.detail.items;

    const movedTask = e.detail.items.find(
      (item) => !rawTasks.find((t) => t.id === item.id && getFieldForGroup(t, groupBy) === colId)
    );
    if (!movedTask) return;

    rawTasks = rawTasks.map((t) =>
      t.id === movedTask.id ? applyGroupChange(t, groupBy, colId) : t
    );

    const patch = buildPatch(groupBy, colId);
    try {
      await updateTaskListFields(fetch, { orgId, userId: currentUserId, projectId, taskId: movedTask.id, patch });
    } catch {
      await loadTasks();
    }
  }

  function getFieldForGroup(task: TaskCardTask, by: GroupByField): string {
    if (by === "status") return task.status ?? "todo";
    if (by === "priority") return String(task.priority ?? 0);
    if (by === "assignee") return task.assignee ?? "Unassigned";
    if (by === "label") return task.labels?.[0] ?? "__none";
    return task.status ?? "pending";
  }

  function applyGroupChange(task: TaskCardTask, by: GroupByField, colId: string): TaskCardTask {
    if (by === "status") return { ...task, status: colId };
    if (by === "priority") return { ...task, priority: Number(colId) };
    if (by === "assignee") return { ...task, assignee: colId === "Unassigned" ? null : colId };
    return task;
  }

  function buildPatch(by: GroupByField, colId: string): Record<string, unknown> {
    if (by === "status") return { status: colId };
    if (by === "priority") return { priority: Number(colId) };
    return {};
  }

  async function submitQuickCreate(status: string) {
    if (!quickCreateTitle.trim()) {
      quickCreateColumn = null;
      return;
    }
    const title = quickCreateTitle.trim();
    quickCreateTitle = "";
    quickCreateColumn = null;
    try {
      const created = await createQuickTask(fetch, { orgId, userId: currentUserId, projectId, title, status });
      if (created?.id) await loadTasks();
    } catch {
      error = "Failed to create task";
    }
  }

  async function loadTasks() {
    loading = true;
    error = null;
    try {
      const tasks = await fetchTaskList(fetch, { orgId, userId: currentUserId, projectId });
      rawTasks = (tasks ?? []).map(taskCardFromRow);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load tasks";
    } finally {
      loading = false;
    }
  }

  async function loadSprints() {
    if (methodology !== "scrum") return;
    try {
      const sprints = await listProjectSprints(fetch, { orgId, projectId });
      currentSprints = sprints ?? [];
    } catch {
      currentSprints = [];
    }
  }

  $effect(() => {
    void loadTasks();
    void loadSprints();
  });

  function taskCardFromRow(task: TaskListRow): TaskCardTask {
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      points: task.points,
      parentId: task.parentId,
      dependencies: { blocks: [], blocked_by: [] },
      descriptionText: task.descriptionText ?? undefined,
      assignee: task.assigneeId,
      taskType: task.parentId ? "subtask" : "task",
    };
  }
</script>

<section data-task-board data-testid="kanban-board" data-project-id={projectId} class="flex h-full flex-col gap-3">
  <!-- Toolbar -->
  <div class="flex flex-wrap items-center gap-2">
    <!-- My Work toggle -->
    <label class="flex items-center gap-1.5 text-sm cursor-pointer">
      <input
        type="checkbox"
        data-my-work-toggle
        bind:checked={myWorkOnly}
        class="h-4 w-4 rounded border-border"
      />
      My Work
    </label>

    <select
      data-type-filter
      bind:value={typeFilter}
      class="h-8 rounded-md border border-input bg-background px-2 text-xs"
      aria-label="Filter by type"
    >
      <option value="all">All Types</option>
      <option value="epic">◆ Epics</option>
      <option value="task">● Tasks</option>
      <option value="bug">⚠ Bugs</option>
    </select>

    <div class="flex rounded-md border border-border overflow-hidden text-xs" role="group" aria-label="Card density">
      <button
        type="button"
        data-density-toggle="compact"
        class={cn(
          "px-2 py-1",
          density === "compact" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
        )}
        onclick={() => (density = "compact")}
      >Compact</button>
      <button
        type="button"
        data-density-toggle="comfortable"
        class={cn(
          "px-2 py-1",
          density === "comfortable" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
        )}
        onclick={() => (density = "comfortable")}
      >Comfortable</button>
    </div>

    {#if methodology === "scrum"}
      <!-- Sprint selector -->
      <select
        data-sprint-selector
        bind:value={selectedSprintId}
        class="h-8 rounded-md border border-input bg-background px-2 text-xs"
        aria-label="Select sprint"
      >
        <option value={undefined}>All sprints</option>
        {#each currentSprints as sprint (sprint.id)}
          <option value={sprint.id}>{sprint.name}</option>
        {/each}
      </select>

      <!-- Tray toggle -->
      <button
        type="button"
        data-tray-toggle
        class={cn(
          "h-8 rounded-md border px-3 text-xs",
          showTray ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted"
        )}
        onclick={() => (showTray = !showTray)}
      >Backlog Tray</button>
    {/if}
  </div>

  <!-- Board + optional tray layout -->
  <div class="flex flex-1 gap-3 overflow-hidden">
    <!-- Kanban columns -->
    <div class="flex flex-1 gap-3 overflow-x-auto pb-2">
      {#if loading}
        <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading…</div>
      {:else if error}
        <div class="flex flex-1 items-center justify-center text-sm text-destructive">{error}</div>
      {:else}
        {#each columns() as column (column.id)}
          {@const overLimit = column.wipLimit != null && column.items.length > column.wipLimit}
          <div
            data-board-column
            data-testid="kanban-column"
            data-column-id={column.id}
            class="flex w-64 shrink-0 flex-col gap-2"
          >
            <!-- Column header -->
            <div
              class={cn(
                "flex items-center justify-between rounded-t-md border-b px-2 py-1.5",
                overLimit ? "border-destructive/60 bg-destructive/5" : "border-border bg-muted/30"
              )}
            >
              <span class="text-sm font-medium capitalize">{column.label}</span>
              <div class="flex items-center gap-2">
                {#if column.wipLimit != null}
                  <WipLimitIndicator current={column.items.length} limit={column.wipLimit} />
                {:else if methodology === "kanban"}
                  <span class="text-xs text-muted-foreground">{column.items.length}</span>
                {/if}
                <button
                  type="button"
                  data-quick-create={column.id}
                  class="text-muted-foreground hover:text-foreground text-sm leading-none"
                  title="Add task"
                  onclick={() => {
                    quickCreateColumn = column.id;
                    quickCreateTitle = "";
                  }}
                >+</button>
              </div>
            </div>

            <!-- Quick create inline input -->
            {#if quickCreateColumn === column.id}
              <input
                data-quick-create-input
                type="text"
                placeholder="Task title…"
                bind:value={quickCreateTitle}
                class="mx-1 h-8 rounded-md border border-input bg-background px-2 text-sm"
                onkeydown={(e) => {
                  if (e.key === "Enter") void submitQuickCreate(column.id);
                  if (e.key === "Escape") quickCreateColumn = null;
                }}
                onblur={() => void submitQuickCreate(column.id)}
              />
            {/if}

            <div
              data-dnd-zone={column.id}
              class="flex flex-1 flex-col gap-2 overflow-y-auto rounded-md p-1 min-h-24"
              use:dndzone={{
                items: column.items,
                flipDurationMs: 150,
                type: "task-card",
              }}
              onconsider={(e) => handleDndConsider(column.id, e)}
              onfinalize={(e) => handleDndFinalize(column.id, e)}
            >
              {#each column.items as task (task.id)}
                <TaskCard {task} {density} />
              {/each}
            </div>
          </div>
        {/each}
      {/if}
    </div>

    {#if methodology === "scrum" && showTray && selectedSprintId}
      <SprintPlanningTray
        {projectId}
        {orgId}
        sprintId={selectedSprintId}
        allTasks={rawTasks}
        onAssign={async (taskId) => {
          if (!selectedSprintId) return;
          await assignTaskToSprint(fetch, { orgId, sprintId: selectedSprintId, taskId });
          await loadTasks();
        }}
      />
    {/if}
  </div>
</section>

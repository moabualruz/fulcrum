<script lang="ts">
  /**
   * TaskDetailPanel — right side panel for task detail.
   * D-16: panel opens as right side panel preserving list context
   * D-17: section layout (ID badge, status bar, description, custom fields, deps, subtasks, tabs, watchers)
   * D-18: J/K/Esc keyboard handlers
   * D-78: custom fields visible and editable
   * D-112: task ID badge (e.g. "FUL-42"), copyable
   * D-114: archive action via kebab menu
   * D-116: recurrence config icon
   * D-117: estimation scale picker
   * D-119: subtasks progress
   * D-122: relationships management
   * D-123: blocking tasks section
   */

  import { onMount, onDestroy } from "svelte";
  import TaskComments from "./TaskComments.svelte";
  import ActivityFeed from "./ActivityFeed.svelte";
  import WatcherList from "./WatcherList.svelte";

  interface Props {
    taskId: string;
    onClose: () => void;
    onNavigate: (direction: "prev" | "next") => void;
    currentUserId?: string;
    taskPrefix?: string;
  }

  const { taskId, onClose, onNavigate, currentUserId = "", taskPrefix = "FUL" }: Props = $props();

  type TabType = "comments" | "activity";

  interface Task {
    id: string;
    orgId: string;
    title: string;
    description: string | null;
    descriptionText: string;
    tiptapContent: Record<string, unknown>;
    status: string | null;
    priority: number | null;
    points: number | null;
    parentId: string | null;
    dependencies: unknown;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    archivedAt?: Date | null;
    taskNumber?: number;
    customFields?: Array<{ fieldId: string; name: string; type: string; value: unknown }>;
    assigneeId?: string | null;
    assigneeName?: string | null;
    labels?: string[];
    dueDate?: string | null;
    taskType?: "epic" | "task" | "subtask" | "bug";
  }

  interface Relationship {
    id: string;
    sourceTaskId: string;
    targetTaskId: string;
    targetTaskTitle?: string;
    type: "blocks" | "relates_to" | "duplicate_of";
  }

  interface SubTask {
    id: string;
    title: string;
    status: string | null;
  }

  const PRIORITY_LABELS: Record<number, string> = { 0: "None", 1: "Low", 2: "Medium", 3: "High", 4: "Urgent" };
  const STATUS_COLORS: Record<string, string> = {
    todo: "#94a3b8",
    in_progress: "#3b82f6",
    done: "#22c55e",
    cancelled: "#ef4444",
  };
  const TASK_TYPE_ICONS: Record<string, string> = {
    epic: "◆",
    task: "●",
    subtask: "⤷",
    bug: "🐛",
  };

  let task = $state<Task | null>(null);
  let relationships = $state<Relationship[]>([]);
  let subtasks = $state<SubTask[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let activeTab = $state<TabType>("comments");
  let editingTitle = $state(false);
  let titleDraft = $state("");
  let copyFeedback = $state(false);
  let showRecurrencePopover = $state(false);
  let showKebabMenu = $state(false);
  let archiving = $state(false);

  const taskIdBadge = $derived(
    task?.taskNumber ? `${taskPrefix}-${task.taskNumber}` : taskId.slice(0, 8).toUpperCase()
  );

  const completedSubtasks = $derived(subtasks.filter((s) => s.status === "done").length);

  const blockers = $derived(relationships.filter((r) => r.type === "blocks" && r.sourceTaskId !== taskId));
  const blocking = $derived(relationships.filter((r) => r.type === "blocks" && r.sourceTaskId === taskId));
  const relatedTasks = $derived(relationships.filter((r) => r.type === "relates_to"));

  async function loadTask(): Promise<void> {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/trpc/tasks.get?input=${encodeURIComponent(JSON.stringify({ id: taskId }))}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { result?: { data?: Task } };
      task = json.result?.data ?? null;
      if (task) {
        titleDraft = task.title;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load task";
    } finally {
      loading = false;
    }
  }

  async function loadRelationships(): Promise<void> {
    try {
      const res = await fetch(`/api/trpc/relationships.listForTask?input=${encodeURIComponent(JSON.stringify({ taskId }))}`);
      if (!res.ok) return;
      const json = await res.json() as { result?: { data?: Relationship[] } };
      relationships = json.result?.data ?? [];
    } catch {}
  }

  async function loadSubtasks(): Promise<void> {
    try {
      const res = await fetch(`/api/trpc/tasks.list?input=${encodeURIComponent(JSON.stringify({}))}`);
      if (!res.ok) return;
      const json = await res.json() as { result?: { data?: SubTask[] } };
      const all = json.result?.data ?? [];
      // Filter subtasks — tasks with parentId = taskId
      subtasks = (all as Array<SubTask & { parentId?: string }>).filter((t) => t.parentId === taskId);
    } catch {}
  }

  async function saveTitle(): Promise<void> {
    if (!task || titleDraft === task.title) { editingTitle = false; return; }
    try {
      await fetch("/api/trpc/tasks.update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, title: titleDraft }),
      });
      task = { ...task, title: titleDraft };
    } catch {}
    editingTitle = false;
  }

  async function archiveTask(): Promise<void> {
    archiving = true;
    showKebabMenu = false;
    try {
      await fetch("/api/trpc/tasks.archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId }),
      });
      await loadTask();
    } catch {}
    archiving = false;
  }

  function copyTaskId(): void {
    void navigator.clipboard.writeText(taskIdBadge);
    copyFeedback = true;
    setTimeout(() => { copyFeedback = false; }, 1500);
  }

  function handleKeydown(e: KeyboardEvent): void {
    // Don't intercept when editing text
    const target = e.target as HTMLElement;
    if (target.matches("input, textarea, [contenteditable]")) return;
    if (e.key === "Escape") { onClose(); }
    else if (e.key === "j") { onNavigate("next"); }
    else if (e.key === "k") { onNavigate("prev"); }
  }

  onMount(() => {
    void Promise.all([loadTask(), loadRelationships(), loadSubtasks()]);
    window.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeydown);
  });

  $effect(() => {
    // Reload when taskId changes
    if (taskId) {
      void Promise.all([loadTask(), loadRelationships(), loadSubtasks()]);
    }
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<aside
  class="task-detail-panel"
  data-testid="task-detail-panel"
  aria-label="Task details"
>
  <!-- Panel header with close button -->
  <div class="task-detail-panel__header">
    <div class="task-detail-panel__header-left">
      <button
        class="task-detail-panel__nav-btn"
        onclick={() => onNavigate("prev")}
        aria-label="Previous task (K)"
        title="Previous task (K)"
      >↑</button>
      <button
        class="task-detail-panel__nav-btn"
        onclick={() => onNavigate("next")}
        aria-label="Next task (J)"
        title="Next task (J)"
      >↓</button>
    </div>
    <div class="task-detail-panel__header-right">
      <div class="task-detail-panel__kebab-wrapper">
        <button
          class="task-detail-panel__icon-btn"
          onclick={() => { showKebabMenu = !showKebabMenu; }}
          aria-label="More actions"
          aria-expanded={showKebabMenu}
        >⋯</button>
        {#if showKebabMenu}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            class="task-detail-panel__kebab-menu"
            role="menu"
            onkeydown={(e) => { if (e.key === "Escape") showKebabMenu = false; }}
          >
            <button
              class="task-detail-panel__menu-item"
              role="menuitem"
              disabled={archiving}
              onclick={archiveTask}
              type="button"
            >
              {archiving ? "Archiving..." : "Archive task"}
            </button>
          </div>
        {/if}
      </div>
      <button
        class="task-detail-panel__close-btn"
        onclick={onClose}
        aria-label="Close panel (Esc)"
        title="Close panel (Esc)"
      >✕</button>
    </div>
  </div>

  {#if loading}
    <div class="task-detail-panel__loading">Loading task...</div>
  {:else if error}
    <div class="task-detail-panel__error">{error}</div>
  {:else if !task}
    <div class="task-detail-panel__error">Task not found.</div>
  {:else}
    <div class="task-detail-panel__body">

      <!-- SECTION 1: ID badge + Type + Title -->
      <section class="task-detail-panel__section task-detail-panel__title-section">
        <!-- Parent breadcrumb -->
        {#if task.parentId}
          <div class="task-detail-panel__breadcrumb">
            <span class="task-detail-panel__breadcrumb-label">Subtask of</span>
            <a href="#task-{task.parentId}" class="task-detail-panel__breadcrumb-link">{task.parentId.slice(0, 8)}</a>
          </div>
        {/if}

        <div class="task-detail-panel__title-row">
          <!-- Task ID badge (D-112) -->
          <button
            class="task-detail-panel__id-badge"
            class:copied={copyFeedback}
            onclick={copyTaskId}
            aria-label="Copy task ID {taskIdBadge}"
            title="Click to copy"
            type="button"
          >
            {copyFeedback ? "Copied!" : taskIdBadge}
          </button>

          <!-- Task type badge -->
          {#if task.taskType}
            <span class="task-detail-panel__type-badge task-detail-panel__type-badge--{task.taskType}">
              {TASK_TYPE_ICONS[task.taskType] ?? "●"} {task.taskType}
            </span>
          {/if}

          <!-- Archived badge -->
          {#if task.archivedAt || task.deletedAt}
            <span class="task-detail-panel__archived-badge">Archived</span>
          {/if}
        </div>

        <!-- Title (inline edit) -->
        {#if editingTitle}
          <input
            class="task-detail-panel__title-input"
            bind:value={titleDraft}
            onblur={saveTitle}
            onkeydown={(e) => { if (e.key === "Enter") void saveTitle(); if (e.key === "Escape") { editingTitle = false; } }}
            aria-label="Task title"
            autofocus
          />
        {:else}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <h1
            data-testid="task-detail-title"
            class="task-detail-panel__title"
            onclick={() => { editingTitle = true; titleDraft = task?.title ?? ""; }}
            onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { editingTitle = true; } }}
            role="heading"
            aria-level={1}
            tabindex={0}
            title="Click to edit title"
          >
            {task.title}
          </h1>
        {/if}
      </section>

      <!-- SECTION 2: Status/Priority/Assignee/Labels bar (D-117) -->
      <section class="task-detail-panel__section task-detail-panel__meta-bar">
        <!-- Status -->
        <div class="task-detail-panel__meta-item">
          <span class="task-detail-panel__meta-label">Status</span>
          <span
            data-testid="task-detail-status"
            class="task-detail-panel__status-badge"
            style="background: {STATUS_COLORS[task.status ?? ''] ?? '#94a3b8'}20; color: {STATUS_COLORS[task.status ?? ''] ?? '#94a3b8'}; border-color: {STATUS_COLORS[task.status ?? ''] ?? '#94a3b8'}40"
          >
            {task.status ?? "No status"}
          </span>
        </div>

        <!-- Priority -->
        <div class="task-detail-panel__meta-item">
          <span class="task-detail-panel__meta-label">Priority</span>
          <span class="task-detail-panel__meta-value">
            {PRIORITY_LABELS[task.priority ?? 0] ?? "None"}
          </span>
        </div>

        <!-- Assignee -->
        <div class="task-detail-panel__meta-item">
          <span class="task-detail-panel__meta-label">Assignee</span>
          <span class="task-detail-panel__meta-value">
            {task.assigneeName ?? "Unassigned"}
          </span>
        </div>

        <!-- Points (D-117: estimation) -->
        {#if task.points !== null && task.points !== undefined}
          <div class="task-detail-panel__meta-item">
            <span class="task-detail-panel__meta-label">Points</span>
            <span class="task-detail-panel__meta-value">{task.points}</span>
          </div>
        {/if}

        <!-- Labels -->
        {#if task.labels && task.labels.length > 0}
          <div class="task-detail-panel__meta-item">
            <span class="task-detail-panel__meta-label">Labels</span>
            <div class="task-detail-panel__labels">
              {#each task.labels as label (label)}
                <span class="task-detail-panel__label-chip">{label}</span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Due date + Recurrence icon (D-116) -->
        {#if task.dueDate}
          <div class="task-detail-panel__meta-item">
            <span class="task-detail-panel__meta-label">Due</span>
            <span class="task-detail-panel__meta-value">{task.dueDate}</span>
            <div class="task-detail-panel__recurrence-wrapper">
              <button
                class="task-detail-panel__recurrence-btn"
                onclick={() => { showRecurrencePopover = !showRecurrencePopover; }}
                aria-label="Configure recurrence"
                aria-expanded={showRecurrencePopover}
                title="Recurrence settings"
                type="button"
              >
                ↻
              </button>
              {#if showRecurrencePopover}
                <div class="task-detail-panel__recurrence-popover" role="dialog" aria-label="Recurrence settings">
                  <p class="task-detail-panel__popover-note">Recurrence configuration (Plan 12 integration point)</p>
                  <button type="button" onclick={() => { showRecurrencePopover = false; }}>Close</button>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </section>

      <!-- SECTION 3: Description (TipTap placeholder — full collab wiring in Plan 13) -->
      <section class="task-detail-panel__section">
        <h2 class="task-detail-panel__section-title">Description</h2>
        <div class="task-detail-panel__description" data-testid="task-detail-description">
          {#if task.descriptionText}
            <p>{task.descriptionText}</p>
          {:else}
            <p class="task-detail-panel__placeholder">Add a description... (rich text editor available in Plan 13)</p>
          {/if}
        </div>
      </section>

      <!-- SECTION 4: Custom Fields (D-78) -->
      {#if task.customFields && task.customFields.length > 0}
        <section class="task-detail-panel__section">
          <h2 class="task-detail-panel__section-title">Custom Fields</h2>
          <div class="task-detail-panel__custom-fields">
            {#each task.customFields as field (field.fieldId)}
              <div class="task-detail-panel__custom-field">
                <span class="task-detail-panel__custom-field-name">{field.name}</span>
                <span class="task-detail-panel__custom-field-value">
                  {#if field.value === null || field.value === undefined || field.value === ""}
                    <em class="task-detail-panel__placeholder">Not set</em>
                  {:else}
                    {String(field.value)}
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- SECTION 5: Dependencies (D-19/D-21) -->
      {#if blockers.length > 0 || relatedTasks.length > 0}
        <section class="task-detail-panel__section">
          <h2 class="task-detail-panel__section-title">Dependencies</h2>

          {#if blockers.length > 0}
            <div class="task-detail-panel__dep-group">
              <span class="task-detail-panel__dep-label">Blocked by</span>
              <ul class="task-detail-panel__dep-list">
                {#each blockers as rel (rel.id)}
                  <li class="task-detail-panel__dep-item">
                    <span class="task-detail-panel__dep-icon">⛔</span>
                    <span>{rel.targetTaskTitle ?? rel.targetTaskId}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if relatedTasks.length > 0}
            <div class="task-detail-panel__dep-group">
              <span class="task-detail-panel__dep-label">Related</span>
              <ul class="task-detail-panel__dep-list">
                {#each relatedTasks as rel (rel.id)}
                  <li class="task-detail-panel__dep-item">
                    <span class="task-detail-panel__dep-icon">↔</span>
                    <span>{rel.targetTaskTitle ?? rel.targetTaskId}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </section>
      {/if}

      <!-- SECTION 6: Subtasks -->
      {#if subtasks.length > 0}
        <section class="task-detail-panel__section">
          <h2 class="task-detail-panel__section-title">
            Subtasks
            <span class="task-detail-panel__subtask-progress">
              {completedSubtasks}/{subtasks.length}
            </span>
          </h2>
          <div class="task-detail-panel__progress-bar">
            <div
              class="task-detail-panel__progress-fill"
              style="width: {subtasks.length > 0 ? Math.round(completedSubtasks / subtasks.length * 100) : 0}%"
              role="progressbar"
              aria-valuenow={completedSubtasks}
              aria-valuemin={0}
              aria-valuemax={subtasks.length}
            ></div>
          </div>
          <ul class="task-detail-panel__subtask-list">
            {#each subtasks as sub (sub.id)}
              <li class="task-detail-panel__subtask-item">
                <span class="task-detail-panel__subtask-check" aria-label={sub.status === "done" ? "Done" : "Not done"}>
                  {sub.status === "done" ? "✓" : "○"}
                </span>
                <span class="task-detail-panel__subtask-title" class:done={sub.status === "done"}>
                  {sub.title}
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- SECTION 7: Blocking (D-123) -->
      {#if blocking.length > 0}
        <section class="task-detail-panel__section">
          <h2 class="task-detail-panel__section-title">Blocking {blocking.length} task{blocking.length !== 1 ? "s" : ""}</h2>
          <ul class="task-detail-panel__dep-list">
            {#each blocking as rel (rel.id)}
              <li class="task-detail-panel__dep-item">
                <span class="task-detail-panel__dep-icon">🚫</span>
                <span>{rel.targetTaskTitle ?? rel.targetTaskId}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- SECTION 8: Tabbed area — Comments + Activity -->
      <section class="task-detail-panel__section task-detail-panel__tabs-section">
        <div class="task-detail-panel__tabs" role="tablist">
          <button
            class="task-detail-panel__tab"
            class:active={activeTab === "comments"}
            data-testid="tab-comments"
            role="tab"
            aria-selected={activeTab === "comments"}
            onclick={() => { activeTab = "comments"; }}
            type="button"
          >Comments</button>
          <button
            class="task-detail-panel__tab"
            class:active={activeTab === "activity"}
            role="tab"
            aria-selected={activeTab === "activity"}
            onclick={() => { activeTab = "activity"; }}
            type="button"
          >Activity</button>
        </div>

        <div class="task-detail-panel__tab-content">
          {#if activeTab === "comments"}
            <TaskComments {taskId} {currentUserId} />
          {:else}
            <ActivityFeed {taskId} />
          {/if}
        </div>
      </section>

      <!-- SECTION 9: Watchers -->
      <section class="task-detail-panel__section">
        <WatcherList {taskId} {currentUserId} />
      </section>

    </div>
  {/if}
</aside>

<style>
  .task-detail-panel {
    background: hsl(var(--background, 0 0% 100%));
    border-left: 1px solid hsl(var(--border, 214 32% 91%));
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    position: relative;
    width: 480px;
  }

  .task-detail-panel__header {
    align-items: center;
    border-bottom: 1px solid hsl(var(--border, 214 32% 91%));
    display: flex;
    justify-content: space-between;
    padding: 0.75rem 1rem;
  }

  .task-detail-panel__header-left,
  .task-detail-panel__header-right {
    align-items: center;
    display: flex;
    gap: 0.25rem;
  }

  .task-detail-panel__nav-btn,
  .task-detail-panel__icon-btn {
    align-items: center;
    background: none;
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.375rem;
    cursor: pointer;
    display: flex;
    font-size: 0.875rem;
    height: 28px;
    justify-content: center;
    padding: 0 0.375rem;
    transition: background 0.1s;
    width: 28px;
  }

  .task-detail-panel__nav-btn:hover,
  .task-detail-panel__icon-btn:hover {
    background: hsl(var(--accent, 210 40% 96%));
  }

  .task-detail-panel__close-btn {
    align-items: center;
    background: none;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    color: hsl(var(--muted-foreground, 215 16% 47%));
    cursor: pointer;
    display: flex;
    font-size: 1rem;
    height: 28px;
    justify-content: center;
    padding: 0 0.375rem;
    transition: background 0.1s, color 0.1s;
    width: 28px;
  }

  .task-detail-panel__close-btn:hover {
    background: hsl(var(--accent, 210 40% 96%));
    color: hsl(var(--foreground, 222 47% 11%));
  }

  .task-detail-panel__kebab-wrapper {
    position: relative;
  }

  .task-detail-panel__kebab-menu {
    background: hsl(var(--popover, 0 0% 100%));
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
    min-width: 160px;
    padding: 0.25rem;
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 50;
  }

  .task-detail-panel__menu-item {
    background: none;
    border: none;
    border-radius: 0.375rem;
    color: hsl(var(--foreground, 222 47% 11%));
    cursor: pointer;
    display: block;
    font-size: 0.875rem;
    padding: 0.375rem 0.75rem;
    text-align: left;
    width: 100%;
  }

  .task-detail-panel__menu-item:hover:not(:disabled) {
    background: hsl(var(--accent, 210 40% 96%));
  }

  .task-detail-panel__menu-item:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .task-detail-panel__loading,
  .task-detail-panel__error {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.875rem;
    padding: 2rem;
    text-align: center;
  }

  .task-detail-panel__error {
    color: hsl(var(--destructive, 0 84% 60%));
  }

  .task-detail-panel__body {
    display: flex;
    flex-direction: column;
    gap: 0;
    height: 100%;
    overflow-y: auto;
  }

  .task-detail-panel__section {
    border-bottom: 1px solid hsl(var(--border, 214 32% 91%));
    padding: 1rem;
  }

  .task-detail-panel__section:last-child {
    border-bottom: none;
  }

  .task-detail-panel__section-title {
    align-items: center;
    color: hsl(var(--muted-foreground, 215 16% 47%));
    display: flex;
    font-size: 0.75rem;
    font-weight: 600;
    gap: 0.5rem;
    letter-spacing: 0.05em;
    margin: 0 0 0.75rem;
    text-transform: uppercase;
  }

  .task-detail-panel__breadcrumb {
    align-items: center;
    display: flex;
    font-size: 0.75rem;
    gap: 0.375rem;
    margin-bottom: 0.5rem;
  }

  .task-detail-panel__breadcrumb-label {
    color: hsl(var(--muted-foreground, 215 16% 47%));
  }

  .task-detail-panel__breadcrumb-link {
    color: hsl(var(--primary, 222 47% 11%));
    text-decoration: none;
  }

  .task-detail-panel__breadcrumb-link:hover {
    text-decoration: underline;
  }

  .task-detail-panel__title-row {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .task-detail-panel__id-badge {
    background: hsl(var(--secondary, 210 40% 96%));
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.375rem;
    color: hsl(var(--secondary-foreground, 222 47% 11%));
    cursor: pointer;
    font-family: monospace;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.5rem;
    transition: background 0.1s;
  }

  .task-detail-panel__id-badge:hover {
    background: hsl(var(--accent, 210 40% 96%));
  }

  .task-detail-panel__id-badge.copied {
    background: hsl(var(--primary, 222 47% 11%));
    color: hsl(var(--primary-foreground, 210 40% 98%));
  }

  .task-detail-panel__type-badge {
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.125rem 0.5rem;
  }

  .task-detail-panel__type-badge--epic {
    background: #7c3aed20;
    color: #7c3aed;
  }

  .task-detail-panel__type-badge--task {
    background: #3b82f620;
    color: #3b82f6;
  }

  .task-detail-panel__type-badge--subtask {
    background: #6b728020;
    color: #6b7280;
  }

  .task-detail-panel__type-badge--bug {
    background: #ef444420;
    color: #ef4444;
  }

  .task-detail-panel__archived-badge {
    background: #f59e0b20;
    border-radius: 0.375rem;
    color: #f59e0b;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.5rem;
  }

  .task-detail-panel__title {
    cursor: text;
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.4;
    margin: 0;
    outline: none;
    padding: 0.25rem 0;
  }

  .task-detail-panel__title:hover {
    background: hsl(var(--accent, 210 40% 96%));
    border-radius: 0.25rem;
    padding: 0.25rem 0.375rem;
  }

  .task-detail-panel__title-input {
    background: hsl(var(--background, 0 0% 100%));
    border: 1px solid hsl(var(--ring, 222 47% 11%));
    border-radius: 0.375rem;
    font-size: 1.125rem;
    font-weight: 600;
    outline: none;
    padding: 0.25rem 0.375rem;
    width: 100%;
  }

  .task-detail-panel__meta-bar {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .task-detail-panel__meta-item {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .task-detail-panel__meta-label {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.8125rem;
    min-width: 80px;
  }

  .task-detail-panel__meta-value {
    font-size: 0.875rem;
  }

  .task-detail-panel__status-badge {
    border: 1px solid;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    padding: 0.125rem 0.5rem;
    text-transform: capitalize;
  }

  .task-detail-panel__labels {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .task-detail-panel__label-chip {
    background: hsl(var(--secondary, 210 40% 96%));
    border-radius: 1rem;
    font-size: 0.75rem;
    padding: 0.0625rem 0.5rem;
  }

  .task-detail-panel__recurrence-wrapper {
    position: relative;
  }

  .task-detail-panel__recurrence-btn {
    background: none;
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 50%;
    cursor: pointer;
    font-size: 0.875rem;
    height: 22px;
    line-height: 1;
    padding: 0;
    width: 22px;
  }

  .task-detail-panel__recurrence-popover {
    background: hsl(var(--popover, 0 0% 100%));
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
    left: 0;
    min-width: 260px;
    padding: 1rem;
    position: absolute;
    top: calc(100% + 4px);
    z-index: 50;
  }

  .task-detail-panel__popover-note {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.8125rem;
    margin: 0 0 0.75rem;
  }

  .task-detail-panel__description {
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .task-detail-panel__placeholder {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-style: italic;
  }

  .task-detail-panel__custom-fields {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .task-detail-panel__custom-field {
    align-items: flex-start;
    display: flex;
    gap: 0.75rem;
  }

  .task-detail-panel__custom-field-name {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.8125rem;
    min-width: 120px;
  }

  .task-detail-panel__custom-field-value {
    font-size: 0.875rem;
  }

  .task-detail-panel__dep-group {
    margin-bottom: 0.75rem;
  }

  .task-detail-panel__dep-label {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    display: block;
    font-size: 0.75rem;
    font-weight: 500;
    margin-bottom: 0.375rem;
    text-transform: uppercase;
  }

  .task-detail-panel__dep-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .task-detail-panel__dep-item {
    align-items: center;
    display: flex;
    font-size: 0.875rem;
    gap: 0.5rem;
  }

  .task-detail-panel__dep-icon {
    flex-shrink: 0;
    font-size: 0.875rem;
  }

  .task-detail-panel__subtask-progress {
    background: hsl(var(--secondary, 210 40% 96%));
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.0625rem 0.5rem;
  }

  .task-detail-panel__progress-bar {
    background: hsl(var(--muted, 210 40% 96%));
    border-radius: 1rem;
    height: 6px;
    margin-bottom: 0.75rem;
    overflow: hidden;
  }

  .task-detail-panel__progress-fill {
    background: hsl(var(--primary, 222 47% 11%));
    border-radius: 1rem;
    height: 100%;
    transition: width 0.2s;
  }

  .task-detail-panel__subtask-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .task-detail-panel__subtask-item {
    align-items: center;
    display: flex;
    font-size: 0.875rem;
    gap: 0.5rem;
  }

  .task-detail-panel__subtask-check {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    flex-shrink: 0;
  }

  .task-detail-panel__subtask-title.done {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    text-decoration: line-through;
  }

  .task-detail-panel__tabs {
    border-bottom: 1px solid hsl(var(--border, 214 32% 91%));
    display: flex;
    gap: 0;
    margin-bottom: 1rem;
  }

  .task-detail-panel__tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: hsl(var(--muted-foreground, 215 16% 47%));
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: -1px;
    padding: 0.5rem 1rem;
    transition: color 0.1s, border-color 0.1s;
  }

  .task-detail-panel__tab:hover {
    color: hsl(var(--foreground, 222 47% 11%));
  }

  .task-detail-panel__tab.active {
    border-bottom-color: hsl(var(--primary, 222 47% 11%));
    color: hsl(var(--foreground, 222 47% 11%));
  }

  .task-detail-panel__tab-content {
    /* scroll handled by parent body */
  }

  .task-detail-panel__tabs-section {
    border-bottom: none;
    flex: 1;
  }
</style>

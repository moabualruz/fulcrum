<script lang="ts">
  import { cn } from "$lib/utils.js";

  export interface TaskCardTask {
    id: string;
    title: string;
    status: string | null;
    priority: number | null;
    points: number | null;
    parentId: string | null;
    dependencies: { blocks: string[]; blocked_by: string[] };
    /** Optional extended fields populated by list endpoints */
    assignee?: string | null;
    assigneeAvatar?: string | null;
    labels?: string[];
    labelColors?: Record<string, string>;
    descriptionText?: string;
    customFields?: Record<string, unknown> | null;
    taskType?: "epic" | "task" | "subtask" | "bug";
    subtaskTotal?: number;
    subtaskDone?: number;
    /** Task identifier like FUL-42 */
    externalId?: string | null;
    blockerTitles?: string[];
  }

  interface Props {
    task: TaskCardTask;
    density?: "compact" | "comfortable";
    onClick?: (task: TaskCardTask) => void;
  }

  const { task, density = "compact", onClick }: Props = $props();

  const isBlocked = $derived(task.dependencies.blocked_by.length > 0);

  const priorityMeta: Record<
    number,
    { label: string; color: string; icon: string }
  > = {
    4: { label: "Urgent", color: "text-red-500", icon: "!!" },
    3: { label: "High", color: "text-orange-500", icon: "↑" },
    2: { label: "Medium", color: "text-yellow-500", icon: "→" },
    1: { label: "Low", color: "text-blue-500", icon: "↓" },
    0: { label: "None", color: "text-muted-foreground", icon: "—" },
  };

  const pMeta = $derived(
    task.priority != null
      ? (priorityMeta[task.priority] ?? priorityMeta[0])
      : priorityMeta[0]
  );

  const typeIcon: Record<string, string> = {
    epic: "◆",
    task: "●",
    subtask: "○",
    bug: "⚠",
  };

  const typeLabel = $derived(typeIcon[task.taskType ?? "task"] ?? "●");

  const descPreview = $derived(
    task.descriptionText ? task.descriptionText.slice(0, 80) : ""
  );

  const hasSubtasks = $derived(
    task.subtaskTotal != null && task.subtaskTotal > 0
  );
  const subtaskPct = $derived(
    hasSubtasks ? ((task.subtaskDone ?? 0) / (task.subtaskTotal ?? 1)) * 100 : 0
  );

  const tooltipId = $derived(`blocker-tip-${task.id}`);

  function handleClick() {
    onClick?.(task);
  }
</script>

<!-- min-h-11 = 44px (touch compliance) -->
<div
  data-task-card
  data-testid="task-card"
  data-task-id={task.id}
  data-density={density}
  role="button"
  tabindex="0"
  class={cn(
    "group relative flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer min-h-11",
    density === "comfortable" && "gap-2"
  )}
  onclick={handleClick}
  onkeydown={(e) => e.key === "Enter" && handleClick()}
>
  <!-- Row 1: type icon + ID + title -->
  <div class="flex items-start gap-1.5">
    <span
      data-task-type-icon
      class={cn(
        "mt-0.5 shrink-0 text-xs",
        task.taskType === "epic" && "text-purple-500",
        task.taskType === "bug" && "text-red-500",
        task.taskType === "subtask" && "text-muted-foreground"
      )}
      title={task.taskType ?? "task"}
    >{typeLabel}</span>

    {#if task.externalId}
      <span data-task-external-id class="shrink-0 text-xs text-muted-foreground font-mono">
        {task.externalId}
      </span>
    {/if}

    <span class={cn("flex-1 text-sm font-medium leading-snug line-clamp-2")}>
      {task.title}
    </span>

    <!-- Blocked badge (D-20) -->
    {#if isBlocked}
      <span
        data-blocked-badge
        class="shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold bg-destructive/10 text-destructive"
        title={task.blockerTitles?.join(", ") ?? "Blocked"}
      >
        Blocked
      </span>
    {/if}
  </div>

  <!-- Row 2 (always): priority + assignee avatar -->
  <div class="flex items-center gap-2">
    <span
      data-priority-icon
      class={cn("text-xs font-bold tabular-nums", pMeta.color)}
      title={pMeta.label}
    >{pMeta.icon}</span>

    {#if task.points != null}
      <span class="text-xs text-muted-foreground" title="Story points">{task.points}pt</span>
    {/if}

    <span class="flex-1" />

    {#if task.assigneeAvatar}
      <img
        data-assignee-avatar
        src={task.assigneeAvatar}
        alt={task.assignee ?? "Assignee"}
        class="h-5 w-5 rounded-full object-cover"
      />
    {:else if task.assignee}
      <span
        data-assignee-initials
        class="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-medium text-primary"
        title={task.assignee}
      >
        {task.assignee.slice(0, 2).toUpperCase()}
      </span>
    {/if}
  </div>

  <!-- Comfortable mode extras (D-13, D-78, D-79) -->
  {#if density === "comfortable"}
    {#if descPreview}
      <p class="text-xs text-muted-foreground line-clamp-2">{descPreview}</p>
    {/if}

    <!-- Labels (D-79) -->
    {#if task.labels && task.labels.length > 0}
      <div data-labels class="flex flex-wrap gap-1">
        {#each task.labels as label (label)}
          <span
            class="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={task.labelColors?.[label]
              ? `background-color: ${task.labelColors[label]}22; color: ${task.labelColors[label]}`
              : "background-color: hsl(var(--muted)); color: hsl(var(--muted-foreground))"}
          >
            {label}
          </span>
        {/each}
      </div>
    {/if}

    <!-- Custom fields (D-78): up to 2 -->
    {#if task.customFields}
      <div data-custom-fields class="flex flex-wrap gap-2">
        {#each Object.entries(task.customFields).slice(0, 2) as [key, val] (key)}
          <span class="text-xs text-muted-foreground">
            <span class="font-medium">{key}:</span>
            {String(val ?? "")}
          </span>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Subtask progress bar -->
  {#if hasSubtasks}
    <div data-subtask-progress class="flex items-center gap-1.5">
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-all"
          style={`width: ${subtaskPct.toFixed(1)}%`}
        ></div>
      </div>
      <span class="text-[10px] text-muted-foreground tabular-nums">
        {task.subtaskDone ?? 0}/{task.subtaskTotal}
      </span>
    </div>
  {/if}
</div>

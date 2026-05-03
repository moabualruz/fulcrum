<script lang="ts">
  import { tick } from "svelte";
  import { cn } from "$lib/utils.js";
  import BoardSheet from "$lib/components/board/BoardSheet.svelte";
  import {
    applyTimelineMove,
    buildTimelineModel,
    loadTimelineZoom,
    rememberTimelineZoom,
    resizeTimelineEnd,
    TIMELINE_ZOOMS,
    type TimelineTask,
    type TimelineZoom,
  } from "./task-timeline";

  interface Props {
    projectId: string;
    tasks: TimelineTask[];
  }

  const { projectId, tasks }: Props = $props();

  /* svelte-ignore state_referenced_locally */
  let localTasks = $state<TimelineTask[]>(tasks.slice());
  let zoom = $state<TimelineZoom>("month");
  let selectedTaskId = $state<string | null>(null);

  const selectedTask = $derived(localTasks.find((task) => task.id === selectedTaskId) ?? null);
  const model = $derived(buildTimelineModel(localTasks, { zoom }));
  const chartWidth = $derived(220 + model.totalDays * ({ day: 28, week: 12, month: 4, quarter: 2 }[zoom]));
  const chartHeight = $derived(Math.max(96, model.rows.length * 44 + 48));

  $effect(() => {
    zoom = loadTimelineZoom(typeof window === "undefined" ? null : window.localStorage);
  });

  function setZoom(next: TimelineZoom): void {
    zoom = next;
    if (typeof window !== "undefined") rememberTimelineZoom(next, window.localStorage);
  }

  async function persistDates(taskId: string, dates: { start_date?: string; due_date?: string }): Promise<void> {
    const fd = new FormData();
    fd.set("id", taskId);
    if (dates.start_date !== undefined) fd.set("start_date", dates.start_date);
    if (dates.due_date !== undefined) fd.set("due_date", dates.due_date);
    const response = await fetch("?/reschedule", { method: "POST", body: fd });
    if (!response.ok) throw new Error("Task reschedule failed");
  }

  async function updateTaskDates(taskId: string, dates: { start_date?: string; due_date?: string }): Promise<void> {
    const previous = localTasks;
    localTasks = localTasks.map((task) => (task.id === taskId ? { ...task, ...dates } : task));
    await tick();
    try {
      await persistDates(taskId, dates);
    } catch (error) {
      localTasks = previous;
      if (typeof window !== "undefined") {
        const { toast } = await import("svelte-sonner");
        toast.error((error as Error).message);
      }
    }
  }

  function move(task: TimelineTask, deltaDays: number): void {
    void updateTaskDates(task.id, applyTimelineMove(task, deltaDays));
  }

  function resize(task: TimelineTask, deltaDays: number): void {
    void updateTaskDates(task.id, resizeTimelineEnd(task, deltaDays));
  }
</script>

<section data-task-timeline data-project-id={projectId} class={cn("flex flex-col gap-3")}>
  <header class={cn("flex flex-wrap items-center justify-between gap-3")}>
    <h2 class={cn("text-lg font-semibold")}>Timeline</h2>
    <div data-timeline-zoom-controls class={cn("flex items-center gap-1")}>
      {#each TIMELINE_ZOOMS as option (option)}
        <button
          type="button"
          data-timeline-zoom={option}
          aria-pressed={zoom === option}
          class={cn(
            "rounded-md border border-border px-3 py-1.5 text-sm",
            zoom === option ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted",
          )}
          onclick={() => setZoom(option)}
        >
          {option}
        </button>
      {/each}
    </div>
  </header>

  <div data-timeline-scroll class={cn("overflow-x-auto rounded-md border border-border bg-background")}>
    <div class={cn("relative")} style={`width: ${chartWidth}px; height: ${chartHeight}px;`}>
      <div
        class={cn("sticky left-0 z-10 border-r border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground")}
        style="width: 220px;"
      >
        Task
      </div>
      <div class={cn("absolute left-[220px] top-0 right-0 h-9 border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground")}>
        {model.rangeStart} to {model.rangeEnd}
      </div>

      <svg data-timeline-dependencies class={cn("pointer-events-none absolute inset-0")} width={chartWidth} height={chartHeight} aria-hidden="true">
        <defs>
          <marker id="timeline-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor"></path>
          </marker>
        </defs>
        {#each model.dependencies as dep (`${dep.from}-${dep.to}`)}
          <path
            data-timeline-dependency
            data-from={dep.from}
            data-to={dep.to}
            d={dep.path}
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            marker-end="url(#timeline-arrow)"
            class={cn("text-muted-foreground")}
          />
        {/each}
      </svg>

      {#each model.rows as row (row.id)}
        {@const task = localTasks.find((item) => item.id === row.id)!}
        <div
          data-timeline-row
          data-task-id={row.id}
          class={cn("absolute left-0 right-0 border-b border-border/70")}
          style={`top: ${row.top - 18}px; height: 44px;`}
        >
          <button
            type="button"
            class={cn("sticky left-0 z-10 h-full truncate border-r border-border bg-background px-3 text-left text-sm font-medium hover:bg-muted")}
            style="width: 220px;"
            onclick={() => (selectedTaskId = row.id)}
          >
            {row.title}
          </button>
          <div class={cn("absolute top-2 flex items-center gap-1")} style={`left: ${row.left}px; width: ${row.width}px;`}>
            <button
              type="button"
              data-timeline-bar
              data-task-id={row.id}
              draggable="true"
              aria-label={`Open task: ${row.title}`}
              class={cn("h-6 min-w-8 flex-1 rounded bg-primary px-2 text-left text-xs font-medium text-primary-foreground shadow-sm")}
              ondragend={(event) => {
                const delta = event.offsetX > 16 ? 1 : event.offsetX < -16 ? -1 : 0;
                if (delta !== 0) move(task, delta);
              }}
              onclick={() => (selectedTaskId = row.id)}
            >
              {row.title}
            </button>
            <button
              type="button"
              data-timeline-resize
              data-task-id={row.id}
              aria-label={`Resize task: ${row.title}`}
              class={cn("h-6 w-2 rounded bg-primary/70")}
              onclick={() => resize(task, 1)}
            ></button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <BoardSheet open={selectedTask !== null} task={selectedTask} onClose={() => (selectedTaskId = null)} />
</section>

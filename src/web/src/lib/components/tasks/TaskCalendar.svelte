<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import type { BoardTask } from "$lib/product-queries";
  import { cn } from "$lib/utils.js";
  import {
    addMonths,
    applyCalendarReschedule,
    buildCalendarMonth,
    buildSprintBandCells,
    revertCalendarReschedule,
    tasksForDate,
    unscheduledTasks,
    type CalendarMove,
    type SprintRange,
  } from "./task-calendar";

  interface Props {
    projectId: string;
    tasks: BoardTask[];
    initialMonth?: string | Date;
    activeSprint?: (SprintRange & { name?: string | null }) | null;
  }

  const { projectId, tasks, initialMonth = new Date(), activeSprint = null }: Props = $props();

  let monthAnchor = $state((() => initialMonth)());
  let localTasks = $state<BoardTask[]>((() => tasks.slice())());
  let expandedDates = $state<Record<string, boolean>>({});
  let unscheduledOpen = $state(true);

  const month = $derived(buildCalendarMonth(monthAnchor));
  const sprintBandCells = $derived(new Set(buildSprintBandCells(month.cells, activeSprint)));
  const unscheduled = $derived(unscheduledTasks(localTasks));

  function visibleTasksFor(date: string): BoardTask[] {
    const due = tasksForDate(localTasks, date);
    return expandedDates[date] ? due : due.slice(0, 3);
  }

  async function persistReschedule(move: CalendarMove): Promise<void> {
    const fd = new FormData();
    fd.set("id", move.taskId);
    fd.set("due_date", move.toDate ?? "");
    const response = await fetch("?/reschedule", { method: "POST", body: fd });
    if (!response.ok) throw new Error("Task reschedule failed");
  }

  async function reschedule(move: CalendarMove): Promise<void> {
    localTasks = applyCalendarReschedule(localTasks, move);
    try {
      await persistReschedule(move);
    } catch (error) {
      localTasks = revertCalendarReschedule(localTasks, move);
      if (typeof window !== "undefined") {
        const { toast } = await import("svelte-sonner");
        toast.error((error as Error).message);
      }
    }
  }

  function monthHref(delta: number): string {
    return `?view=calendar&month=${addMonths(monthAnchor, delta)}`;
  }
</script>

<section data-task-calendar data-project-id={projectId} class={cn("grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]")}>
  <div class={cn("min-w-0 space-y-3")}>
    <header class={cn("flex flex-wrap items-center justify-between gap-2")}>
      <h2 class={cn("text-lg font-semibold")}>{month.label}</h2>
      <div class={cn("flex items-center gap-1")}>
        <a data-calendar-prev href={monthHref(-1)} aria-label="previous month" class={cn("rounded-md border border-border px-2 py-1 text-sm")}>‹</a>
        <a data-calendar-today href="?view=calendar" class={cn("rounded-md border border-border px-3 py-1 text-sm")}>Today</a>
        <a data-calendar-next href={monthHref(1)} aria-label="next month" class={cn("rounded-md border border-border px-2 py-1 text-sm")}>›</a>
      </div>
    </header>

    <div class={cn("grid grid-cols-7 border-l border-t border-border text-xs text-muted-foreground")}>
      {#each ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as weekday}
        <div class={cn("border-b border-r border-border px-2 py-1 font-medium")}>{weekday}</div>
      {/each}
    </div>

    <div data-calendar-grid class={cn("grid grid-cols-7 border-l border-border")}>
      {#each month.cells as cell (cell.date)}
        {@const dueTasks = tasksForDate(localTasks, cell.date)}
        {@const overflow = Math.max(0, dueTasks.length - 3)}
        <section
          data-calendar-cell
          data-date={cell.date}
          aria-label="tasks for {cell.date}"
          aria-dropeffect="move"
          class={cn(
            "relative min-h-28 border-b border-r border-border p-2",
            cell.inMonth ? "bg-background" : "bg-muted/30 text-muted-foreground",
          )}
          use:dndzone={{ items: dueTasks, flipDurationMs: 0 }}
          onfinalize={(event) => {
            const item = event.detail.items[0] as BoardTask | undefined;
            if (item) void reschedule({ taskId: item.id, fromDate: item.due_date ?? null, toDate: cell.date });
          }}
        >
          {#if sprintBandCells.has(cell.date)}
            <div
              data-sprint-band-cell
              data-date={cell.date}
              title={activeSprint?.name ?? "Active sprint"}
              class={cn("absolute inset-x-1 top-8 h-8 rounded bg-primary/10")}
            ></div>
          {/if}
          <div class={cn("relative z-10 mb-2 text-xs font-medium")}>{cell.day}</div>
          <div class={cn("relative z-10 flex flex-col gap-1")}>
            {#each visibleTasksFor(cell.date) as task (task.id)}
              <a
                data-calendar-task
                data-task-id={task.id}
                href={`/projects/${projectId}/board?task=${task.id}`}
                class={cn("truncate rounded border border-border bg-card px-2 py-1 text-xs text-card-foreground shadow-sm hover:bg-muted")}
              >
                {task.title}
              </a>
            {/each}
            {#if overflow > 0 && !expandedDates[cell.date]}
              <button
                type="button"
                data-calendar-more
                class={cn("rounded border border-border bg-muted px-2 py-1 text-left text-xs")}
                onclick={() => (expandedDates[cell.date] = true)}
              >
                +{overflow} more
              </button>
            {/if}
          </div>
        </section>
      {/each}
    </div>
  </div>

  <aside data-unscheduled-sidebar class={cn("rounded-md border border-border bg-card")}>
    <button
      type="button"
      data-unscheduled-toggle
      class={cn("flex w-full items-center justify-between px-3 py-2 text-sm font-medium")}
      onclick={() => (unscheduledOpen = !unscheduledOpen)}
    >
      <span>Unscheduled</span>
      <span class={cn("text-xs text-muted-foreground")}>{unscheduled.length}</span>
    </button>
    {#if unscheduledOpen}
      <div class={cn("flex flex-col gap-2 border-t border-border p-3")}>
        {#each unscheduled as task (task.id)}
          <a
            data-unscheduled-task
            data-task-id={task.id}
            href={`/projects/${projectId}/board?task=${task.id}`}
            class={cn("rounded border border-border px-2 py-1 text-sm hover:bg-muted")}
          >
            {task.title}
          </a>
        {:else}
          <p data-unscheduled-empty class={cn("text-sm text-muted-foreground")}>No unscheduled tasks</p>
        {/each}
      </div>
    {/if}
  </aside>
</section>

<script lang="ts">
  /**
   * CalendarView.svelte — Phase 05 Plan 10 (D-63, D-64, D-65)
   *
   * @event-calendar/core wrapper with:
   * - Month/week/day views (D-63)
   * - Tasks positioned by due_date; multi-day spans if start_date set (D-64)
   * - Overdue tasks highlighted red (D-64)
   * - Sprint date-range overlay as background band (D-65)
   * - Drag-to-reschedule via form actions
   */

  import { Calendar, DayGrid, TimeGrid, Interaction } from "@event-calendar/core";

  export interface CalendarTask {
    id: string;
    title: string;
    status?: string | null;
    priority?: number | null;
    start_date?: string | null;
    due_date?: string | null;
    updated_at?: string | null;
  }

  export interface SprintRange {
    id?: string;
    name?: string | null;
    start_date: string;
    end_date: string;
  }

  interface Props {
    projectId: string;
    tasks?: CalendarTask[];
    activeSprint?: SprintRange | null;
    ontaskclick?: (taskId: string) => void;
  }

  const {
    projectId,
    tasks = [],
    activeSprint = null,
    ontaskclick,
  }: Props = $props();

  // ── View mode ─────────────────────────────────────────────────────────────────

  type ViewMode = "dayGridMonth" | "timeGridWeek" | "timeGridDay";
  let viewMode = $state<ViewMode>("dayGridMonth");

  // ── Priority colors ───────────────────────────────────────────────────────────

  const PRIORITY_BG: Record<number, string> = {
    0: "#6b7280",
    1: "#ef4444",
    2: "#f97316",
    3: "#3b82f6",
    4: "#22c55e",
  };

  function priorityColor(priority: number | null | undefined): string {
    return PRIORITY_BG[priority ?? 0] ?? "#6b7280";
  }

  // ── Compute overdue ───────────────────────────────────────────────────────────

  function isOverdue(task: CalendarTask): boolean {
    if (!task.due_date) return false;
    const due = new Date(task.due_date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return due < now && task.status !== "done" && task.status !== "cancelled";
  }

  // ── Event-calendar events ─────────────────────────────────────────────────────

  const calendarEvents = $derived(
    tasks
      .filter((t) => t.due_date)
      .map((t) => {
        const overdue = isOverdue(t);
        const dueDate = new Date(t.due_date!);
        // end is exclusive in event-calendar, so add 1 day for all-day events
        const endDate = new Date(dueDate);
        endDate.setDate(endDate.getDate() + 1);

        const startDate = t.start_date ? new Date(t.start_date) : dueDate;

        return {
          id: t.id,
          title: t.title,
          start: startDate,
          end: endDate,
          allDay: true,
          backgroundColor: overdue ? "#ef4444" : priorityColor(t.priority),
          borderColor: overdue ? "#b91c1c" : undefined,
          extendedProps: { taskId: t.id, overdue },
        };
      }),
  );

  // Sprint overlay as background event (D-65)
  const sprintEvent = $derived(
    activeSprint
      ? [
          {
            id: `sprint-${activeSprint.id ?? "active"}`,
            title: activeSprint.name ?? "Sprint",
            start: new Date(activeSprint.start_date),
            end: (() => {
              const d = new Date(activeSprint.end_date);
              d.setDate(d.getDate() + 1);
              return d;
            })(),
            allDay: true,
            display: "background",
            backgroundColor: "rgba(59,130,246,0.12)",
            extendedProps: { isSprint: true },
          },
        ]
      : [],
  );

  const allEvents = $derived([...calendarEvents, ...sprintEvent]);

  // ── Drag-to-reschedule ───────────────────────────────────────────────────────

  async function handleEventDrop({
    event,
    delta,
  }: {
    event: { id: string; start: Date; end: Date };
    delta: { days: number };
  }): Promise<void> {
    if (!event.id || event.id.startsWith("sprint-")) return;
    const dueDate = new Date(event.end);
    dueDate.setDate(dueDate.getDate() - 1); // end is exclusive
    const fd = new FormData();
    fd.set("id", event.id);
    fd.set("due_date", dueDate.toISOString().slice(0, 10));
    if (event.start) {
      fd.set("start_date", event.start.toISOString().slice(0, 10));
    }
    await fetch(`/projects/${projectId}/calendar?/reschedule`, { method: "POST", body: fd });
  }

  // ── Click ─────────────────────────────────────────────────────────────────────

  function handleEventClick({ event }: { event: { id: string } }): void {
    if (event.id.startsWith("sprint-")) return;
    if (ontaskclick) ontaskclick(event.id);
  }

  // ── Calendar options ─────────────────────────────────────────────────────────

  const calendarOptions = $derived({
    view: viewMode,
    events: allEvents,
    editable: true,
    eventDrop: handleEventDrop,
    eventClick: handleEventClick,
    headerToolbar: {
      start: "title",
      center: "",
      end: "today prev,next",
    },
    height: "calc(100vh - 240px)",
  });
</script>

<style>
  .calendar-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid hsl(var(--border));
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .calendar-toolbar-label {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
  }

  .view-buttons {
    display: flex;
    gap: 0.25rem;
  }

  .view-btn {
    font-size: 0.875rem;
    padding: 0.25rem 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    cursor: pointer;
  }

  .view-btn.active {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-color: hsl(var(--primary));
  }
</style>

<div class="calendar-toolbar">
  <span class="calendar-toolbar-label">View:</span>
  <div class="view-buttons" data-view={viewMode}>
    <button
      type="button"
      class="view-btn {viewMode === 'dayGridMonth' ? 'active' : ''}"
      onclick={() => { viewMode = "dayGridMonth"; }}
    >Month</button>
    <button
      type="button"
      class="view-btn {viewMode === 'timeGridWeek' ? 'active' : ''}"
      onclick={() => { viewMode = "timeGridWeek"; }}
    >Week</button>
    <button
      type="button"
      class="view-btn {viewMode === 'timeGridDay' ? 'active' : ''}"
      onclick={() => { viewMode = "timeGridDay"; }}
    >Day</button>
  </div>

  {#if activeSprint}
    <span style="font-size:0.75rem; color:hsl(var(--muted-foreground)); margin-left:auto;">
      Sprint: {activeSprint.name ?? "Active"} ({activeSprint.start_date} – {activeSprint.end_date})
    </span>
  {/if}
</div>

<div data-testid="calendar-grid">
<Calendar
  plugins={[DayGrid, TimeGrid, Interaction]}
  options={calendarOptions}
/>
</div>

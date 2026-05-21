<script lang="ts">
  /**
   * GanttView.svelte: task workflow (D-60, D-61, D-62, D-102, D-103, D-104)
   *
   * SVAR wx-svelte-gantt wrapper with:
   * - Dependency arrows from 'blocks' relationships (D-61)
   * - Critical path highlighted in red (D-102)
   * - Slack visualization for non-critical tasks (D-104)
   * - Drag-to-reschedule via form actions
   * - Zoom: day/week/month
   * - Grouping: epic/assignee/sprint
   */

  import { Gantt, Toolbar, Material } from "wx-svelte-gantt";
  import { computeCriticalPath, CriticalPathCache, type TaskNode, type Relationship } from "./CriticalPath.js";
  import type { ITask, ILink, IScaleConfig, IApi } from "wx-svelte-gantt";

  type GroupBy = "epic" | "assignee" | "sprint";

  export interface GanttTask {
    id: string;
    title: string;
    status?: string | null;
    priority?: number | null;
    start_date?: string | null;
    due_date?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    parent_id?: string | null;
    assignee_id?: string | null;
    sprint_id?: string | null;
    epic_id?: string | null;
    blocks?: string[];
    blocked_by?: string[];
  }

  export interface GanttRelationship {
    id?: string;
    sourceTaskId: string;
    targetTaskId: string;
    type: string;
  }

  interface Props {
    projectId: string;
    tasks?: GanttTask[];
    relationships?: GanttRelationship[];
    groupBy?: GroupBy;
    ontaskclick?: (taskId: string) => void;
  }

  const {
    projectId,
    tasks = [],
    relationships = [],
    groupBy = "epic",
    ontaskclick,
  }: Props = $props();

  // ── Critical path ────────────────────────────────────────────────────────────

  const cpCache = new CriticalPathCache();

  const cpNodes = $derived(
    tasks.map((t): TaskNode => ({
      id: t.id,
      startDate: t.start_date ? new Date(t.start_date) : null,
      dueDate: t.due_date ? new Date(t.due_date) : null,
      duration: 0,
    })),
  );

  const cpRels = $derived(
    relationships.map((r): Relationship => ({
      sourceTaskId: r.sourceTaskId,
      targetTaskId: r.targetTaskId,
      type: r.type,
    })),
  );

  const cpResult = $derived(cpCache.get(cpNodes, cpRels));

  // ── SVAR data format ──────────────────────────────────────────────────────────

  const PRIORITY_COLORS: Record<number, string> = {
    0: "#6b7280", // no priority
    1: "#ef4444", // urgent
    2: "#f97316", // high
    3: "#3b82f6", // medium
    4: "#22c55e", // low
  };

  function taskStart(t: GanttTask): Date {
    if (t.start_date) return new Date(t.start_date);
    if (t.created_at) return new Date(t.created_at);
    return new Date();
  }

  function taskEnd(t: GanttTask): Date {
    if (t.due_date) return new Date(t.due_date);
    const s = taskStart(t);
    const e = new Date(s);
    e.setDate(e.getDate() + 1);
    return e;
  }

  function parentId(t: GanttTask): string | number {
    if (groupBy === "epic" && t.epic_id) return `epic-${t.epic_id}`;
    if (groupBy === "assignee" && t.assignee_id) return `assignee-${t.assignee_id}`;
    if (groupBy === "sprint" && t.sprint_id) return `sprint-${t.sprint_id}`;
    return 0;
  }

  const svarTasks = $derived((): ITask[] => {
    const isCritical = (id: string) => cpResult.criticalTaskIds.has(id);
    const slackDays = (id: string) => cpResult.slack.get(id) ?? 0;

    // Group header rows
    const groups = new Map<string, ITask>();
    for (const t of tasks) {
      const pid = parentId(t);
      if (pid !== 0 && !groups.has(String(pid))) {
        let label = String(pid);
        if (groupBy === "epic") label = `Epic: ${t.epic_id ?? "unknown"}`;
        else if (groupBy === "assignee") label = `Assignee: ${t.assignee_id ?? "unassigned"}`;
        else if (groupBy === "sprint") label = `Sprint: ${t.sprint_id ?? "unscheduled"}`;
        groups.set(String(pid), {
          id: String(pid),
          text: label,
          type: "summary",
          open: true,
          parent: 0,
          start: new Date(),
          end: new Date(),
        });
      }
    }

    const taskRows: ITask[] = tasks.map((t) => {
      const critical = isCritical(t.id);
      const slack = slackDays(t.id);
      const css = critical ? "gantt-critical-task" : slack > 0 ? "gantt-slack-task" : "";
      return {
        id: t.id,
        text: t.title,
        start: taskStart(t),
        end: taskEnd(t),
        parent: parentId(t),
        type: "task" as const,
        // Custom fields (accessible via task[key])
        _critical: critical,
        _slack: slack,
        _priority: t.priority ?? 0,
        css,
      };
    });

    return [...groups.values(), ...taskRows];
  });

  // ── SVAR links (dependency arrows) ───────────────────────────────────────────

  const svarLinks = $derived((): ILink[] => {
    return relationships
      .filter((r) => r.type === "blocks")
      .map((r, i) => ({
        id: r.id ?? `link-${i}`,
        source: r.sourceTaskId,
        target: r.targetTaskId,
        type: "e2s" as const, // finish-to-start
      }));
  });

  // ── Scales / zoom ─────────────────────────────────────────────────────────────

  type ZoomLevel = "day" | "week" | "month";
  let zoomLevel = $state<ZoomLevel>("week");

  const scales = $derived((): IScaleConfig[] => {
    if (zoomLevel === "day") {
      return [
        { unit: "week", step: 1, format: "Week %W" },
        { unit: "day", step: 1, format: "%j %D" },
      ];
    }
    if (zoomLevel === "week") {
      return [
        { unit: "month", step: 1, format: "%F %Y" },
        { unit: "week", step: 1, format: "W%W" },
      ];
    }
    // month
    return [
      { unit: "year", step: 1, format: "%Y" },
      { unit: "month", step: 1, format: "%M" },
    ];
  });

  // ── SVAR API (init callback) ──────────────────────────────────────────────────

  let ganttApi: IApi | null = null;

  function initGantt(api: IApi): void {
    ganttApi = api;

    // Task bar click → open detail panel
    api.on("select-task", ({ id }: { id: string | number }) => {
      if (ontaskclick) ontaskclick(String(id));
    });

    // Drag-to-reschedule
    api.on("update-task", async ({ id, task }: { id: string | number; task: ITask }) => {
      if (!task.start || !task.end) return;
      const fd = new FormData();
      fd.set("id", String(id));
      fd.set("start_date", task.start.toISOString().slice(0, 10));
      fd.set("due_date", task.end.toISOString().slice(0, 10));
      await fetch(`/projects/${projectId}/gantt?/reschedule`, { method: "POST", body: fd });
    });
  }
</script>

<style>
  .gantt-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid hsl(var(--border));
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .gantt-toolbar label {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
  }

  .gantt-toolbar select {
    font-size: 0.875rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    color: hsl(var(--foreground));
  }

  .gantt-wrapper {
    height: calc(100vh - 220px);
    min-height: 400px;
  }

  :global(.gantt-critical-task .wx-bar) {
    background: #ef4444 !important;
    border-color: #b91c1c !important;
  }

  :global(.gantt-slack-task .wx-bar) {
    opacity: 0.75;
  }

  :global(.wx-link.gantt-critical-link) {
    stroke: #ef4444;
  }
</style>

<div class="gantt-toolbar">
  <label for="gantt-zoom">Zoom:</label>
  <select id="gantt-zoom" bind:value={zoomLevel}>
    <option value="day">Day</option>
    <option value="week">Week</option>
    <option value="month">Month</option>
  </select>

  <label for="gantt-group">Group by:</label>
  <select id="gantt-group" value={groupBy} onchange={(e) => {
    const target = e.currentTarget as HTMLSelectElement;
    const val = target.value as GroupBy;
    // propagate via event if needed; groupBy is a prop
    void val;
  }}>
    <option value="epic">Epic</option>
    <option value="assignee">Assignee</option>
    <option value="sprint">Sprint</option>
  </select>

  <span style="margin-left:auto; font-size:0.75rem; color:hsl(var(--muted-foreground));">
    {cpResult.criticalTaskIds.size} critical task{cpResult.criticalTaskIds.size === 1 ? "" : "s"}
  </span>
</div>

<div class="gantt-wrapper" data-testid="gantt-timeline">
  <Material />
  <Gantt
    tasks={svarTasks()}
    links={svarLinks()}
    scales={scales()}
    init={initGantt}
    cellWidth={40}
    scaleHeight={30}
    cellHeight={40}
  />
</div>

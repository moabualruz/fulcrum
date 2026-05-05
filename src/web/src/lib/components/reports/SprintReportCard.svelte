<script lang="ts">
  /**
   * SprintReportCard — sprint summary card (D-38, D-29, D-30).
   *
   * Renders frozen summary for closed sprints, live stats for open sprints.
   * Velocity comparison vs prior sprints. Retrospective notes (read-only).
   * Task table with status timeline.
   */
  import { onMount } from "svelte";
  import { cn } from "$lib/utils.js";

  // ── Types ────────────────────────────────────────────────────────────────────

  interface SprintSummary {
    completedCount: number;
    completedPoints: number;
    carriedOver: number;
    addedMidSprint: number;
    removed: number;
    scopeChangePct: number;
  }

  interface SprintTask {
    id: string;
    title: string;
    status: string;
    storyPoints?: number | null;
    statusHistory?: Array<{ status: string; enteredAt: string }>;
  }

  interface VelocityEntry {
    sprintName: string;
    completedPoints: number;
  }

  interface SprintData {
    id: string;
    name: string;
    startDate?: string | null;
    endDate?: string | null;
    status: "active" | "completed" | "planned";
    closedSummary?: SprintSummary | null;
    retrospectiveNotes?: Record<string, unknown> | null;
    tasks?: SprintTask[];
    velocityHistory?: VelocityEntry[];
  }

  // ── Props ────────────────────────────────────────────────────────────────────

  export let sprintId: string;
  export let trpc: {
    sprints: {
      get: { query: (input: { id: string }) => Promise<SprintData | null> };
    };
  } | null = null;

  // ── State ────────────────────────────────────────────────────────────────────

  let sprint: SprintData | null = null;
  let loading = true;
  let error = "";

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  onMount(async () => {
    await load();
  });

  async function load() {
    if (!trpc) return;
    loading = true;
    error = "";
    try {
      sprint = await trpc.sprints.get.query({ id: sprintId });
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to load sprint";
    } finally {
      loading = false;
    }
  }

  function fmt(val: number | undefined | null, suffix = ""): string {
    if (val == null) return "—";
    return `${val}${suffix}`;
  }

  function fmtDate(d: string | null | undefined): string {
    if (!d) return "—";
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function notesText(notes: Record<string, unknown> | null | undefined): string {
    if (!notes) return "";
    // TipTap JSON → plain text extraction
    function extractText(node: unknown): string {
      if (!node || typeof node !== "object") return "";
      const n = node as Record<string, unknown>;
      if (n["type"] === "text") return String(n["text"] ?? "");
      const content = n["content"];
      if (Array.isArray(content)) return content.map(extractText).join(" ");
      return "";
    }
    return extractText(notes).trim();
  }

  function velocityAvg(history: VelocityEntry[]): number {
    if (!history.length) return 0;
    return Math.round(history.reduce((s, e) => s + e.completedPoints, 0) / history.length);
  }
</script>

<div class={cn("flex flex-col gap-6")}>
  {#if loading}
    <p class={cn("text-sm text-muted-foreground")}>Loading sprint…</p>
  {:else if error}
    <p class={cn("text-sm text-destructive")}>{error}</p>
  {:else if !sprint}
    <p class={cn("text-sm text-muted-foreground")}>Sprint not found.</p>
  {:else}
    <!-- Header -->
    <div class={cn("flex items-baseline justify-between")}>
      <div>
        <h2 class={cn("text-xl font-semibold")}>{sprint.name}</h2>
        <p class={cn("text-sm text-muted-foreground")}>
          {fmtDate(sprint.startDate)} – {fmtDate(sprint.endDate)}
        </p>
      </div>
      <span class={cn(
        "text-xs px-2 py-0.5 rounded-full font-medium",
        sprint.status === "completed" ? "bg-green-100 text-green-700" :
        sprint.status === "active" ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"
      )}>
        {sprint.status === "completed" ? "Closed" : sprint.status === "active" ? "In Progress" : "Planned"}
      </span>
    </div>

    {#if sprint.status !== "completed"}
      <div class={cn("bg-blue-50 text-blue-700 text-sm px-3 py-2 rounded-md")}>
        Sprint in progress — stats are live and not yet frozen.
      </div>
    {/if}

    <!-- Stats row (frozen if closed, live if open) -->
    {@const summary = sprint.closedSummary}
    {#if summary}
      <div class={cn("grid grid-cols-3 gap-3 sm:grid-cols-6")}>
        {#each [
          { label: "Completed", value: fmt(summary.completedCount) },
          { label: "Points", value: fmt(summary.completedPoints) },
          { label: "Carried over", value: fmt(summary.carriedOver) },
          { label: "Added mid-sprint", value: fmt(summary.addedMidSprint) },
          { label: "Removed", value: fmt(summary.removed) },
          { label: "Scope change", value: fmt(summary.scopeChangePct, "%") },
        ] as stat}
          <div class={cn("flex flex-col gap-0.5 p-3 rounded-lg border border-border bg-card")}>
            <div class={cn("text-xs text-muted-foreground")}>{stat.label}</div>
            <div class={cn("text-2xl font-bold tabular-nums")}>{stat.value}</div>
          </div>
        {/each}
      </div>
    {:else}
      <div class={cn("text-sm text-muted-foreground italic")}>No summary data yet.</div>
    {/if}

    <!-- Velocity comparison (D-30) -->
    {#if sprint.velocityHistory && sprint.velocityHistory.length > 0}
      <div class={cn("border border-border rounded-lg p-4")}>
        <h3 class={cn("text-sm font-semibold mb-3")}>Velocity</h3>
        <div class={cn("flex flex-col gap-1.5")}>
          {#each sprint.velocityHistory as entry}
            <div class={cn("flex items-center gap-3")}>
              <div class={cn("text-xs text-muted-foreground w-32 truncate")}>{entry.sprintName}</div>
              <div class={cn("flex-1 h-4 bg-muted rounded-full overflow-hidden")}>
                {@const maxPts = Math.max(...sprint.velocityHistory!.map((e) => e.completedPoints), 1)}
                <div
                  class={cn("h-full bg-primary/60 rounded-full transition-all")}
                  style="width: {(entry.completedPoints / maxPts) * 100}%"
                />
              </div>
              <div class={cn("text-xs font-medium w-8 text-right tabular-nums")}>{entry.completedPoints}</div>
            </div>
          {/each}
          <div class={cn("text-xs text-muted-foreground mt-1")}>
            Rolling avg: <span class={cn("font-medium")}>{velocityAvg(sprint.velocityHistory)} pts</span>
          </div>
        </div>
      </div>
    {/if}

    <!-- Retrospective (D-29) -->
    {#if sprint.retrospectiveNotes}
      {@const retroText = notesText(sprint.retrospectiveNotes)}
      {#if retroText}
        <div class={cn("border border-border rounded-lg p-4")}>
          <h3 class={cn("text-sm font-semibold mb-2")}>Retrospective Notes</h3>
          <p class={cn("text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed")}>{retroText}</p>
        </div>
      {/if}
    {/if}

    <!-- Task table -->
    {#if sprint.tasks && sprint.tasks.length > 0}
      <div class={cn("border border-border rounded-lg overflow-hidden")}>
        <div class={cn("px-4 py-2 bg-muted text-xs font-semibold")}>Tasks ({sprint.tasks.length})</div>
        <table class={cn("w-full text-sm")}>
          <thead class={cn("bg-muted/50 text-xs text-muted-foreground")}>
            <tr>
              <th class={cn("px-3 py-2 text-left font-medium")}>Title</th>
              <th class={cn("px-3 py-2 text-left font-medium")}>Status</th>
              <th class={cn("px-3 py-2 text-right font-medium")}>Points</th>
              <th class={cn("px-3 py-2 text-left font-medium")}>Status Timeline</th>
            </tr>
          </thead>
          <tbody>
            {#each sprint.tasks as task}
              <tr class={cn("border-t border-border hover:bg-muted/30")}>
                <td class={cn("px-3 py-2 truncate max-w-xs")}>{task.title}</td>
                <td class={cn("px-3 py-2")}>
                  <span class={cn("text-xs px-1.5 py-0.5 rounded bg-muted")}>{task.status}</span>
                </td>
                <td class={cn("px-3 py-2 text-right tabular-nums")}>{task.storyPoints ?? "—"}</td>
                <td class={cn("px-3 py-2 text-xs text-muted-foreground")}>
                  {#if task.statusHistory && task.statusHistory.length > 0}
                    {task.statusHistory.map((h) => `${h.status} ${new Date(h.enteredAt).toLocaleDateString()}`).join(" → ")}
                  {:else}
                    —
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>

<script lang="ts">
  import { onMount } from "svelte";
  import { Badge, Card, Stat } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";
  import { fetchSprintReport, type SprintReportData } from "./sprint-report-api.js";

  interface VelocityEntry {
    sprintName: string;
    completedPoints: number;
  }

  type SprintData = SprintReportData;

  interface Props {
    sprintId: string;
    orgId: string;
  }

  let { sprintId, orgId }: Props = $props();

  let sprint: SprintData | null = null;
  let loading = true;
  let error = "";

  onMount(async () => {
    await load();
  });

  async function load() {
    loading = true;
    error = "";
    try {
      sprint = await fetchSprintReport(fetch, { orgId, sprintId });
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : "Failed to load sprint";
    } finally {
      loading = false;
    }
  }

  function fmt(val: number | undefined | null, suffix = ""): string {
    if (val == null) return "-";
    return `${val}${suffix}`;
  }

  function fmtDate(d: string | null | undefined): string {
    if (!d) return "-";
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function notesText(notes: Record<string, unknown> | null | undefined): string {
    if (!notes) return "";
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

  function velocityMax(history: VelocityEntry[]): number {
    return Math.max(...history.map((e) => e.completedPoints), 1);
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
      <Badge variant={sprint.status === "completed" ? "success" : sprint.status === "active" ? "accent" : "default"}>
        {sprint.status === "completed" ? "Closed" : sprint.status === "active" ? "In Progress" : "Planned"}
      </Badge>
    </div>

    {#if sprint.status !== "completed"}
      <div class={cn("bg-blue-50 text-blue-700 text-sm px-3 py-2 rounded-md")}>
        Sprint in progress: stats are live and not yet frozen.
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
          <Stat label={stat.label} value={stat.value} />
        {/each}
      </div>
    {:else}
      <div class={cn("text-sm text-muted-foreground italic")}>No summary data yet.</div>
    {/if}

    {#if sprint.velocityHistory && sprint.velocityHistory.length > 0}
      <Card class={cn("p-4")}>
        <h3 class={cn("text-sm font-semibold mb-3")}>Velocity</h3>
        <div class={cn("flex flex-col gap-1.5")}>
          {#each sprint.velocityHistory as entry}
            <div class={cn("flex items-center gap-3")}>
              <div class={cn("text-xs text-muted-foreground w-32 truncate")}>{entry.sprintName}</div>
              <div class={cn("flex-1 h-4 bg-muted rounded-full overflow-hidden")}>
                <div
                  class={cn("h-full bg-primary/60 rounded-full transition-all")}
                  style="width: {(entry.completedPoints / velocityMax(sprint.velocityHistory!)) * 100}%"
                />
              </div>
              <div class={cn("text-xs font-medium w-8 text-right tabular-nums")}>{entry.completedPoints}</div>
            </div>
          {/each}
          <div class={cn("text-xs text-muted-foreground mt-1")}>
            Rolling avg: <span class={cn("font-medium")}>{velocityAvg(sprint.velocityHistory)} pts</span>
          </div>
        </div>
      </Card>
    {/if}

    {#if sprint.retrospectiveNotes}
      {@const retroText = notesText(sprint.retrospectiveNotes)}
      {#if retroText}
        <Card class={cn("p-4")}>
          <h3 class={cn("text-sm font-semibold mb-2")}>Retrospective Notes</h3>
          <p class={cn("text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed")}>{retroText}</p>
        </Card>
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
                  <Badge variant="default" size="sm">{task.status}</Badge>
                </td>
                <td class={cn("px-3 py-2 text-right tabular-nums")}>{task.storyPoints ?? "-"}</td>
                <td class={cn("px-3 py-2 text-xs text-muted-foreground")}>
                  {#if task.statusHistory && task.statusHistory.length > 0}
                    {task.statusHistory.map((h) => `${h.status} ${new Date(h.enteredAt).toLocaleDateString()}`).join(" → ")}
                  {:else}
                    -
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

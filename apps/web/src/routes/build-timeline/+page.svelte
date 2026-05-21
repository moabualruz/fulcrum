<script lang="ts">
  /**
   * Build · Timeline — the OD `build-timeline.html` 14-day Gantt Workbench.
   *
   * The `◰ Timeline` Build layout (`IA-MAP.md §2.3`, canonical route
   * `/<ws>/projects/<projId>/build/gantt` — see `apps/web/CONTEXT.md`
   * "BuildTimelineWorkbench" for the timeline/gantt naming resolution). A
   * 14-day Gantt: a day-header row with today highlighted, one lane per work
   * item, a positioned status-colored bar per lane (`DESIGN.md §4.9` tones),
   * a `.now` vertical line at the current day, and a status legend.
   *
   * Each lane carries an icon and the universal `DESIGN.md §4.11` per-Step
   * mode affordance row, rendered `compact` (icon-only) — `DESIGN.md §4.13`
   * and `§7` list timeline lanes as a compact-mode surface.
   *
   * Bar geometry mirrors the TUI `apps/tui/src/screens/task-timeline.ts`
   * `barFor` helper exactly (`startOffset`/`endOffset` clamped to the window)
   * so the web and TUI 14-day Gantt stay in parity — the lane shape is the TUI
   * `TuiTask` contract (`design-alignment/build.md`).
   *
   * Composes `@fulcrum/ui-kit` primitives only (Button / EmptyState) plus the
   * shared `mode-affordance-host` ModeRow. `ui_kit_adds: []`.
   */
  import { Button, EmptyState } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";
  import {
    ModeRow,
    createStepModeRow,
    modeAffordanceHooks,
  } from "$lib/components/app/mode-affordance-host.ts";
  import type { TimelineLane } from "$lib/components/app/build-timeline-fixture.ts";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  /** Active trace id for the Build Workbench — the `DESIGN.md §4.10` trace spine. */
  const traceId = "tr_8f29a4c1b3e0d5f7";

  const timeline = $derived(data.timeline);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  /** Parse an ISO `YYYY-MM-DD` to a UTC date (matches TUI `parseDate`). */
  function parseDate(value: string): Date {
    return new Date(`${value.slice(0, 10)}T00:00:00Z`);
  }

  /** Whole-day delta `from → to` (matches TUI `daysBetween`). */
  function daysBetween(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
  }

  /** Add `days` to a date and return a fresh date. */
  function addDays(base: Date, days: number): Date {
    return new Date(base.getTime() + days * MS_PER_DAY);
  }

  /**
   * The day-header columns: one entry per visible day, each with its
   * `Mon DD` / `DD` label and whether it is today (the highlighted column).
   */
  const dayColumns = $derived.by(() => {
    const start = parseDate(timeline.windowStart);
    const todayKey = timeline.today.slice(0, 10);
    return Array.from({ length: timeline.daysVisible }, (_, offset) => {
      const date = addDays(start, offset);
      const iso = date.toISOString().slice(0, 10);
      const day = date.getUTCDate();
      const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      return {
        iso,
        // OD labels the first column and each month boundary with the month.
        label: offset === 0 || day === 1 ? `${month} ${day}` : String(day),
        isToday: iso === todayKey,
      };
    });
  });

  /**
   * The `.now` vertical line offset, as a 0–1 fraction of the window — the
   * current-day marker. Mirrors the OD `left: calc((idx) / 14 * 100%)`.
   */
  const nowFraction = $derived.by(() => {
    const start = parseDate(timeline.windowStart);
    const offset = daysBetween(start, parseDate(timeline.today));
    return Math.min(Math.max(offset, 0), timeline.daysVisible) / timeline.daysVisible;
  });

  /**
   * Resolve a lane's bar geometry — `left`/`width` as 0–1 fractions of the
   * 14-day window. Uses the TUI `barFor` clamp: `startOffset` floored at 0,
   * `endOffset` capped at the last visible day; an inclusive day span.
   */
  function barGeometry(lane: TimelineLane): { left: number; width: number } {
    const start = parseDate(timeline.windowStart);
    const startOffset = Math.max(0, daysBetween(start, parseDate(lane.startDate)));
    const endOffset = Math.min(
      timeline.daysVisible - 1,
      daysBetween(start, parseDate(lane.endDate)),
    );
    const span = Math.max(1, endOffset - startOffset + 1);
    return {
      left: startOffset / timeline.daysVisible,
      width: span / timeline.daysVisible,
    };
  }

  /** The lane name-cell icon glyph for each OD `data-ic` value. */
  const ICON_GLYPH: Record<string, string> = {
    "git-pull-request": "⌥",
    radio: "◉",
    activity: "∿",
    grid: "▦",
    workflow: "◇",
    terminal: "▸_",
    "message-circle": "💬",
    book: "▤",
  };

  /** Bar tone class per `DESIGN.md §4.9` status vocabulary. */
  const BAR_TONE: Record<TimelineLane["status"], string> = {
    running: "bg-accent text-accent-foreground",
    complete: "bg-success text-success-foreground",
    awaiting: "bg-warning text-warning-foreground",
    blocked: "bg-destructive text-destructive-foreground",
  };

  /** The bar label — OD shows id + progress (running) or id + ✓ (complete). */
  function barLabel(lane: TimelineLane): string {
    if (lane.status === "complete") return `${lane.id} ✓`;
    if (typeof lane.progress === "number") return `${lane.id} · ${lane.progress}%`;
    return lane.id;
  }

  /**
   * The five Build layouts (`IA-MAP.md §2.3` / OD `build-timeline.html`
   * `view-switch`). Board / List / Timeline / Graph / Runs each have a
   * production route; Timeline is the active layout.
   */
  const layouts = [
    { id: "board", label: "Board", glyph: "▦", href: "/build-board" },
    { id: "list", label: "List", glyph: "☰", href: "/build-list" },
    { id: "graph", label: "Graph", glyph: "◇", href: "/build-graph" },
    { id: "timeline", label: "Timeline", glyph: "◰", href: "/build-timeline" },
    { id: "runs", label: "Runs", glyph: "◉", href: "/build-runs" },
  ] as const;

  /** The status legend — swatch tone + label, OD `.legend`. */
  const legend = [
    { tone: "bg-accent", label: "running" },
    { tone: "bg-success", label: "complete" },
    { tone: "bg-warning", label: "awaiting" },
    { tone: "bg-destructive", label: "blocked" },
    { tone: "bg-accent/80", label: "now line" },
  ] as const;
</script>

<svelte:head>
  <title>Build timeline</title>
</svelte:head>

<section
  data-build-timeline
  data-state={timeline.isEmpty ? "empty" : "populated"}
  class={cn("flex min-h-[calc(100vh-8rem)] flex-col gap-3 overflow-hidden px-6 py-4")}
>
  <header data-build-timeline-head class={cn("flex flex-wrap items-baseline gap-3.5")}>
    <h1 class={cn("text-[22px] font-semibold tracking-tight")}>Build · Timeline</h1>
    <span data-build-timeline-count class={cn("font-mono text-xs text-muted-foreground")}>
      {timeline.cycle} · {timeline.daysVisible} days · {timeline.lanes.length} work items
    </span>
    <nav
      data-build-timeline-layouts
      role="tablist"
      aria-label="Build views"
      class={cn("ml-auto inline-flex flex-wrap items-center overflow-hidden rounded-md border border-border")}
    >
      {#each layouts as layout (layout.id)}
        <a
          href={layout.href}
          role="tab"
          aria-current={layout.id === "timeline" ? "page" : undefined}
          aria-selected={layout.id === "timeline"}
          data-build-layout={layout.id}
          class={cn(
            "inline-flex items-center gap-1.5 border-r border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors last:border-r-0 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
            layout.id === "timeline" && "bg-accent text-accent-foreground hover:text-accent-foreground",
          )}
        >
          <span aria-hidden="true">{layout.glyph}</span>
          {layout.label}
        </a>
      {/each}
    </nav>
  </header>

  {#if timeline.isEmpty}
    <div data-build-timeline-empty class={cn("flex flex-1 items-center justify-center py-10")}>
      <EmptyState
        title="No timeline yet."
        description="The timeline shows lanes per work item across the cycle. Promote captures or add build items to populate lanes."
      >
        {#snippet icon()}
          <span aria-hidden="true">◰</span>
        {/snippet}
        {#snippet actions()}
          <a
            href="/build-list"
            data-build-timeline-empty-action="list"
            class={cn("rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40")}
          >Open Build list</a>
          <a
            href="/build-board"
            data-build-timeline-empty-action="board"
            class={cn("rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40")}
          >View Board</a>
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <div
      data-build-timeline-wrap
      class={cn("@container mt-1 overflow-auto rounded-lg border border-border bg-card")}
      style:container-type="inline-size"
    >
      <div
        data-build-timeline-grid
        class={cn("grid min-w-[56rem]")}
        style:grid-template-columns={`220px repeat(${timeline.daysVisible}, minmax(0, 1fr))`}
      >
        <!-- Day-header row — today highlighted (OD `tl-head`). -->
        <div
          data-build-timeline-head-label
          class={cn("border-b border-r border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground")}
        >
          Work item
        </div>
        {#each dayColumns as day (day.iso)}
          <div
            data-build-timeline-day={day.iso}
            data-today={day.isToday ? "true" : undefined}
            class={cn(
              "border-b border-border/60 px-1 py-2 text-center font-mono text-[10px] text-muted-foreground",
              "@max-[720px]:px-0.5 @max-[720px]:text-[9px]",
              day.isToday && "font-semibold text-accent",
            )}
          >
            {day.label}
          </div>
        {/each}

        <!-- One lane per work item — the name cell is the addressable Step. -->
        {#each timeline.lanes as lane (lane.id)}
          {@const geo = barGeometry(lane)}
          {@const modeScope = { stepId: lane.id, kind: "task-card" as const, traceId, title: lane.title }}
          <div
            data-build-timeline-lane={lane.id}
            data-build-timeline-lane-name
            data-status={lane.status}
            {...modeAffordanceHooks(modeScope)}
            class={cn("flex min-h-9 items-center gap-1.5 border-b border-r border-border/60 px-3 py-1.5 text-xs font-medium")}
          >
            <span data-build-timeline-lane-icon aria-hidden="true" class={cn("text-[11px] text-muted-foreground")}>
              {ICON_GLYPH[lane.icon] ?? "▦"}
            </span>
            <span class={cn("truncate @max-[720px]:hidden")}>{lane.title}</span>
            <span class={cn("ml-auto")}>
              <ModeRow {...createStepModeRow(modeScope)} value="manual" />
            </span>
          </div>
          <div
            data-build-timeline-lane-track={lane.id}
            data-status={lane.status}
            style:grid-column={`2 / span ${timeline.daysVisible}`}
            class={cn("relative min-h-9 border-b border-border/60")}
          >
              <!-- Day grid lines beneath the bar. -->
              <div
                aria-hidden="true"
                class={cn("absolute inset-0 grid")}
                style:grid-template-columns={`repeat(${timeline.daysVisible}, minmax(0, 1fr))`}
              >
                {#each dayColumns as day (day.iso)}
                  <div class={cn("border-r border-border/40 last:border-r-0", day.isToday && "bg-accent/5")}></div>
                {/each}
              </div>
              <!-- The current-day `.now` vertical line. -->
              <div
                data-build-timeline-now
                aria-hidden="true"
                class={cn("absolute bottom-0 top-0 z-[2] w-0.5 bg-accent")}
                style:left={`${(nowFraction * 100).toFixed(4)}%`}
              ></div>
              <!-- The positioned status-colored bar. -->
              <div
                data-build-timeline-bar={lane.id}
                data-status={lane.status}
                title={`${lane.title} — ${lane.status}`}
                style:left={`${(geo.left * 100).toFixed(4)}%`}
                style:width={`${(geo.width * 100).toFixed(4)}%`}
                class={cn(
                  "absolute top-1/2 z-[1] flex h-4 -translate-y-1/2 items-center overflow-hidden whitespace-nowrap rounded-[3px] px-1.5 text-[10px] font-semibold",
                  BAR_TONE[lane.status],
                )}
              >
                {barLabel(lane)}
              </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Status legend (OD `.legend`). -->
    <div data-build-timeline-legend class={cn("flex flex-wrap gap-3.5 text-[11px] text-muted-foreground")}>
      {#each legend as item (item.label)}
        <span data-build-timeline-legend-item={item.label} class={cn("inline-flex items-center gap-1.5")}>
          <span aria-hidden="true" class={cn("inline-block size-3 rounded-[2px]", item.tone)}></span>
          {item.label}
        </span>
      {/each}
    </div>

    <!-- Data-state switcher — drives the OD hidden empty-state branch. -->
    <div data-build-timeline-state-controls class={cn("flex items-center gap-2 pt-1")}>
      <a href="/build-timeline?state=empty" data-build-timeline-show-empty>
        <Button size="sm" variant="outline">Show empty timeline</Button>
      </a>
    </div>
  {/if}

  {#if timeline.isEmpty}
    <div data-build-timeline-state-controls class={cn("flex items-center gap-2 pt-1")}>
      <a href="/build-timeline" data-build-timeline-show-populated>
        <Button size="sm" variant="outline">Show populated timeline</Button>
      </a>
    </div>
  {/if}
</section>

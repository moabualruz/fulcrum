<script lang="ts">
  /**
   * Mobile Build runs feed + bottom-sheet run detail: OD `mobile-runs.html`
   * fidelity surface.
   *
   * IA-MAP.md §617 (six-icon bottom tab bar: Capture/Plan/Build/Review/Ship/
   * Operate, Build current), DESIGN.md §4.7 (Sheet (mobile): full width × 60vh
   * draggable, the mobile equivalent of drawer/peek), DESIGN.md §8 (inline
   * permission prompts: one button per option, never modal except for
   * irreversible ops), DESIGN.md §4.10 (trace badge), DESIGN.md §3.1 (container
   * queries: no horizontal overflow at 390px).
   *
   * IA-MAP.md §2.3 routes the Build runs feed at
   * `/<ws>/projects/<projId>/build/runs` (mobile viewport); this design-e2e
   * fixture route renders the canonical mobile stage shell: a 390px phone
   * frame with the `scope-m` header, a scrollable run feed, a bottom-sheet run
   * detail, and the six-stage bottom tab bar: so the OD surface is proven
   * before the production stage route consumes it.
   *
   * The mobile feed reads the same canonical runs data shape as the desktop
   * `build-runs` feed (`prd-web-build-runs-feed-od-fidelity`): the mobile sheet
   * is a responsive presentation of one run, not a separate data path.
   */
  import { page } from "$app/stores";
  import {
    Button,
    Chip,
    EmptyState,
    ModeRow,
    RunFeedItem,
    StatusBadge,
    TraceChip,
    type WorkflowMode,
    type WorkflowStatus,
  } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  /**
   * Provenance of the runs data layer. The desktop `build-runs` feed
   * (`prd-web-build-runs-feed-od-fidelity`) defines the canonical `feedRuns`
   * row shape; this route mirrors it so web mobile + desktop read one data
   * model, not two fragmented run paths.
   */
  const CANONICAL_RUNS_SOURCE =
    "apps/web/src/routes/build-runs/+page.svelte#feedRuns";

  type SparkTone = "ok" | "warn" | "bad" | "run";
  type FeedRun = {
    runId: string;
    taskKey: string;
    title: string;
    agent: string;
    status: WorkflowStatus;
    age: string;
    step: string;
    elapsed: string;
    spark?: { tone: SparkTone; height: number }[];
  };

  /**
   * Canonical runs data layer (DESIGN.md §9 run feed). Same row shape the
   * desktop `build-runs` feed renders: the mobile sheet is one responsive
   * presentation of this data, not a separate fragmented run path.
   */
  const feedRuns: FeedRun[] = [
    {
      runId: "run_8f29a4c",
      taskKey: "AUTH-43",
      title: "Persist issuance row per kid",
      agent: "opus-4.7",
      status: "running",
      age: "3m",
      step: "step 3/8",
      elapsed: "3m elapsed",
      spark: [
        { tone: "ok", height: 6 },
        { tone: "ok", height: 10 },
        { tone: "ok", height: 8 },
        { tone: "warn", height: 14 },
        { tone: "ok", height: 12 },
        { tone: "ok", height: 10 },
        { tone: "run", height: 16 },
      ],
    },
    {
      runId: "run_2c14e9a",
      taskKey: "AUTH-44",
      title: "verifyToken · dual-verify legacy",
      agent: "opus-4.7",
      status: "waiting-input",
      age: "5m",
      step: "waiting on AUTH-43",
      elapsed: "5m elapsed",
    },
    {
      runId: "run_91b0072",
      taskKey: "AUTH-47",
      title: "Rate-limiter · bucket per kid",
      agent: "opus-4.7",
      status: "running",
      age: "1m",
      step: "step 1/3",
      elapsed: "1m elapsed",
      spark: [
        { tone: "ok", height: 8 },
        { tone: "ok", height: 10 },
        { tone: "run", height: 14 },
      ],
    },
    {
      runId: "run_aa01734",
      taskKey: "AUTH-45",
      title: "DELETE /sessions/:kid endpoint",
      agent: "gpt-5.4",
      status: "completed",
      age: "12m",
      step: "completed",
      elapsed: "9m elapsed",
    },
    {
      runId: "run_56e3d12",
      taskKey: "OBS-12",
      title: "Dedupe trace-id propagation",
      agent: "opus-4.7",
      status: "failed",
      age: "1h",
      step: "step 7/9",
      elapsed: "14m elapsed",
      spark: [
        { tone: "ok", height: 8 },
        { tone: "ok", height: 10 },
        { tone: "warn", height: 14 },
        { tone: "bad", height: 16 },
      ],
    },
    {
      runId: "run_db90b21",
      taskKey: "DB-9",
      title: "Prisma migrate stuck on shadow db",
      agent: "gpt-5.4",
      status: "blocked",
      age: "31m",
      step: "step 2/4",
      elapsed: "31m elapsed",
    },
  ];

  /** Horizontal filter chip row (OD `.filters-m`). */
  type FilterKey = "live" | "mine" | "auth" | "failing" | "today";
  const FILTERS: FilterKey[] = ["live", "mine", "auth", "failing", "today"];

  const SPARK_TONE: Record<SparkTone, string> = {
    ok: "bg-success",
    warn: "bg-warning",
    bad: "bg-destructive",
    run: "bg-accent",
  };

  /** Six workflow stages: the OD bottom `.tab-bar` (IA-MAP.md §617). */
  type StageTab = {
    key: string;
    label: string;
    glyph: string;
    href: string;
  };
  const STAGE_TABS: StageTab[] = [
    { key: "capture", label: "Capture", glyph: "▤", href: "/cross-cutting-perf" },
    { key: "plan", label: "Plan", glyph: "☰", href: "/plan-session" },
    { key: "build", label: "Build", glyph: "▦", href: "/mobile-runs" },
    { key: "review", label: "Review", glyph: "⎇", href: "/review" },
    { key: "ship", label: "Ship", glyph: "➤", href: "/ship" },
    { key: "operate", label: "Operate", glyph: "◉", href: "/operate-telemetry" },
  ];
  const CURRENT_STAGE = "build";

  /** Inline tool-call cards rendered inside the sheet body (DESIGN.md §4.5). */
  type DiffLine = { kind: "add" | "del" | "ctx"; n: string; text: string };
  type ToolCard = {
    name: string;
    args: string;
    status: WorkflowStatus;
    open: boolean;
    diff?: DiffLine[];
    log?: string;
  };

  /** A pending permission prompt for the selected run (DESIGN.md §8). */
  type PermissionPrompt = {
    tool: string;
    command: string;
    options: { key: string; label: string; primary?: boolean; tone?: "ghost" }[];
  };

  type RunDetail = {
    permission?: PermissionPrompt;
    tools: ToolCard[];
  };

  const RUN_DETAIL: Record<string, RunDetail> = {
    run_8f29a4c: {
      permission: {
        tool: "shell.run",
        command: "pnpm prisma migrate dev --name sessions_kid --create-only",
        options: [
          { key: "deny", label: "Deny", tone: "ghost" },
          { key: "allow-once", label: "Allow once" },
          { key: "allow-continue", label: "▶ Allow + continue", primary: true },
        ],
      },
      tools: [
        {
          name: "edit_file",
          args: "issuance.repo.ts · 2 hunks",
          status: "completed",
          open: true,
          diff: [
            { kind: "add", n: "1", text: 'import { db } from "../db"' },
            { kind: "add", n: "2", text: "export async function record(i: Issuance) {" },
            { kind: "add", n: "3", text: "  await db.issuance.create({ data: i })" },
            { kind: "add", n: "4", text: "}" },
          ],
        },
        {
          name: "shell.run",
          args: "pnpm test --filter auth · 12s",
          status: "running",
          open: false,
          log: "Tests: 42 passed, 4 running",
        },
      ],
    },
  };

  const DEFAULT_DETAIL: RunDetail = { tools: [] };

  const TRACE_ID = "tr_8f29a4c1b3e0d5f7";

  /**
   * `?state=empty` renders the no-runs branch: the design-e2e harness drives
   * the empty-state matrix through this query, mirroring the desktop runs
   * feed's state switch (DESIGN.md §4.8 / COPY.md Build runs feed).
   */
  const isEmptyState = $derived($page.url.searchParams.get("state") === "empty");
  const visibleRuns = $derived(isEmptyState ? [] : feedRuns);
  const runCount = $derived(visibleRuns.length);

  let activeFilter = $state<FilterKey>("live");
  // The selected run drives the bottom sheet. OD `mobile-runs.html` renders the
  // sheet open on the first run; this route mirrors that default.
  let selectedRunId = $state<string | null>(feedRuns[0]?.runId ?? null);
  let permissionDecision = $state<string | null>(null);
  let feedModes = $state<Record<string, WorkflowMode>>(
    Object.fromEntries(feedRuns.map((run) => [run.runId, "manual" as WorkflowMode])),
  );

  const selectedRun = $derived(
    isEmptyState || !selectedRunId
      ? null
      : (feedRuns.find((run) => run.runId === selectedRunId) ?? null),
  );
  const selectedDetail = $derived(
    selectedRunId ? (RUN_DETAIL[selectedRunId] ?? DEFAULT_DETAIL) : DEFAULT_DETAIL,
  );
  const sheetOpen = $derived(selectedRun !== null);

  /**
   * Sheet height: DESIGN.md §4.7 "full width × 60vh draggable". The grabber
   * resizes the sheet between a collapsed peek and a near-full expansion; the
   * default 60vh matches the OD frame's default sheet height.
   */
  const SHEET_DEFAULT_VH = 60;
  const SHEET_MIN_VH = 32;
  const SHEET_MAX_VH = 88;
  let sheetHeightVh = $state(SHEET_DEFAULT_VH);
  let dragOriginY = $state(0);
  let dragOriginVh = $state(SHEET_DEFAULT_VH);

  function clampSheetVh(value: number): number {
    return Math.min(SHEET_MAX_VH, Math.max(SHEET_MIN_VH, value));
  }

  function startSheetDrag(event: PointerEvent): void {
    dragOriginY = event.clientY;
    dragOriginVh = sheetHeightVh;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveSheetDrag(event: PointerEvent): void {
    if (!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return;
    // Dragging the grabber up (smaller clientY) grows the sheet.
    const deltaVh = ((dragOriginY - event.clientY) / window.innerHeight) * 100;
    sheetHeightVh = clampSheetVh(dragOriginVh + deltaVh);
  }

  function endSheetDrag(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  }

  function nudgeSheet(event: KeyboardEvent): void {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      sheetHeightVh = clampSheetVh(sheetHeightVh + 8);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      sheetHeightVh = clampSheetVh(sheetHeightVh - 8);
    }
  }

  function openSheet(runId: string): void {
    selectedRunId = runId;
    permissionDecision = null;
    sheetHeightVh = SHEET_DEFAULT_VH;
  }

  function closeSheet(): void {
    selectedRunId = null;
    permissionDecision = null;
    sheetHeightVh = SHEET_DEFAULT_VH;
  }

  function decidePermission(option: string): void {
    permissionDecision = option;
  }
</script>

<svelte:head>
  <title>Mobile · Build runs | Fulcrum</title>
</svelte:head>

<!--
  The mobile stage shell. A 390px phone frame so the OD `mobile-runs.html`
  layout is reproduced verbatim: status notch, scope-m header, scrollable
  feed, bottom sheet, and the six-stage bottom tab bar. `overflow-hidden`
  plus the explicit 390px frame width guarantee zero horizontal overflow
  (DESIGN.md §3.1 container-query rule).
-->
<div
  data-mobile-runs
  data-canonical-runs-source={CANONICAL_RUNS_SOURCE}
  data-state={isEmptyState ? "empty" : "populated"}
  class="mx-auto flex min-h-screen w-full max-w-[420px] items-center justify-center overflow-x-hidden bg-background p-0 sm:py-8"
>
  <section
    data-mobile-runs-frame
    class={cn(
      "relative grid h-[844px] w-full max-w-[390px] overflow-hidden",
      "border border-border bg-card text-card-foreground sm:rounded-[2.75rem]",
    )}
    style="grid-template-rows: 44px auto 1fr 64px;"
  >
    <!-- status notch -->
    <div
      data-mobile-status-bar
      class="flex items-center px-6 pt-3.5 text-[15px] font-semibold"
    >
      <span class="flex-1">11:27</span>
      <span
        aria-hidden="true"
        class="absolute left-1/2 top-2.5 h-8 w-[120px] -translate-x-1/2 rounded-[18px] bg-foreground"
      ></span>
    </div>

    <!-- scope-m header: crumb, run count, trace pill, AI Assist toggle -->
    <header
      data-mobile-runs-header
      class="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-1.5"
    >
      <div class="min-w-0 flex-1">
        <p data-mobile-runs-crumb class="font-mono text-[10px] text-muted-foreground">
          build · runs · live
        </p>
        <h1 data-mobile-runs-count class="text-[17px] font-semibold leading-tight">
          {runCount} runs
        </h1>
      </div>
      <TraceChip
        traceId={TRACE_ID}
        short
        data-mobile-runs-trace
        class="shrink-0"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-mobile-runs-assist
        aria-label="Open AI Assist"
        class="h-9 w-9 shrink-0"
      >
        <span aria-hidden="true" class="text-base">⊞</span>
      </Button>
    </header>

    <!-- scrollable run feed -->
    <div data-mobile-runs-feed class="flex min-h-0 flex-col overflow-y-auto">
      <!-- horizontal filter chip row -->
      <div
        data-mobile-runs-filters
        class="flex gap-1.5 overflow-x-auto border-b border-border bg-muted/40 px-4 py-2"
      >
        {#each FILTERS as filter (filter)}
          <Chip
            tone={filter === activeFilter ? "accent" : "neutral"}
            interactive="yes"
            removable={false}
            data-mobile-runs-filter={filter}
            data-active={filter === activeFilter ? "true" : undefined}
            role="button"
            tabindex={0}
            aria-pressed={filter === activeFilter}
            class="shrink-0 whitespace-nowrap font-mono"
            onclick={() => (activeFilter = filter)}
            onkeydown={(event: KeyboardEvent) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activeFilter = filter;
              }
            }}
          >
            {filter}
          </Chip>
        {/each}
      </div>

      {#if visibleRuns.length === 0}
        <!-- empty state: COPY.md Build runs feed template -->
        <div data-mobile-runs-empty class="p-6">
          <EmptyState
            title="No runs yet in this project."
            description="Or press ▶ Play on any task."
          >
            {#snippet actions()}
              <Button variant="default" size="sm">Dispatch first run</Button>
            {/snippet}
          </EmptyState>
        </div>
      {:else}
        <ul data-mobile-runs-list class="flex flex-col">
          {#each visibleRuns as run (run.runId)}
            <li>
              <!--
                Each row: the OD `.run-m`. `RunFeedItem` is the canonical
                ui-kit identity block (status badge · title · task key ·
                agent); the run-feed-specific age and monospace meta line
                compose around it as the OD row affordances.
              -->
              <button
                type="button"
                data-mobile-run-row
                data-run-id={run.runId}
                data-status={run.status}
                aria-haspopup="dialog"
                aria-expanded={run.runId === selectedRunId}
                class={cn(
                  "flex w-full flex-col gap-1.5 border-b border-border px-1 text-left",
                  "transition-colors hover:bg-muted/40",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  run.runId === selectedRunId && "bg-muted/60",
                )}
                onclick={() => openSheet(run.runId)}
              >
                <RunFeedItem
                  runId={run.runId}
                  taskKey={run.taskKey}
                  taskTitle={run.title}
                  agentName={run.agent}
                  status={run.status}
                  elapsed={run.age}
                  class="border-b-0 px-3 py-2.5"
                />
                <div class="flex flex-col gap-1.5 px-3 pb-2.5">
                  <p
                    data-mobile-run-meta
                    class="break-words font-mono text-[11px] text-muted-foreground"
                  >
                    {run.taskKey} · {run.agent} · {run.runId} · {run.step}
                  </p>
                  {#if run.spark}
                    <div
                      data-mobile-run-sparkline
                      class="flex h-4 items-end gap-0.5"
                      aria-label="Recent step outcomes"
                    >
                      {#each run.spark as bar, index (index)}
                        <span
                          data-spark-bar
                          data-spark-tone={bar.tone}
                          class={cn("w-1.5 rounded-[1px]", SPARK_TONE[bar.tone])}
                          style={`height:${bar.height}px`}
                        ></span>
                      {/each}
                    </div>
                  {/if}
                </div>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- bottom sheet: DESIGN.md §4.7 (full width × 60vh draggable) -->
    {#if sheetOpen && selectedRun}
      <div
        data-mobile-runs-sheet-backdrop
        class="absolute inset-0 z-30 flex flex-col justify-end bg-foreground/50"
      >
        <!--
          The exposed backdrop above the sheet is the dismiss target: it grows
          to fill the space the sheet does not cover, so tapping outside the
          sheet closes it without the sheet intercepting the click.
        -->
        <button
          type="button"
          data-mobile-runs-sheet-dismiss
          aria-label="Dismiss run detail"
          class="min-h-11 flex-1 cursor-default"
          onclick={closeSheet}
        ></button>
        <aside
          data-mobile-runs-sheet
          data-draggable="true"
          data-sheet-height-vh={sheetHeightVh}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-runs-sheet-title"
          class={cn(
            "relative grid w-full overflow-hidden",
            "rounded-t-3xl border-t border-border bg-card shadow-2xl",
          )}
          style={`grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto 1fr auto; height: ${sheetHeightVh}vh; max-height: ${SHEET_MAX_VH}vh; animation: mobile-sheet-up var(--fulcrum-dur-slow, 240ms) ease;`}
        >
          <!-- draggable grabber: DESIGN.md §4.7 -->
          <div
            data-mobile-runs-sheet-grabber
            role="slider"
            aria-orientation="vertical"
            aria-label="Resize run detail sheet"
            aria-valuemin={SHEET_MIN_VH}
            aria-valuemax={SHEET_MAX_VH}
            aria-valuenow={Math.round(sheetHeightVh)}
            tabindex="0"
            class="flex touch-none cursor-grab justify-center py-2.5 active:cursor-grabbing"
            onpointerdown={startSheetDrag}
            onpointermove={moveSheetDrag}
            onpointerup={endSheetDrag}
            onpointercancel={endSheetDrag}
            onkeydown={nudgeSheet}
          >
            <span
              aria-hidden="true"
              class="h-1 w-10 rounded-full bg-border"
            ></span>
          </div>

          <!-- sheet head: status badge + title + meta -->
          <div class="grid gap-1.5 border-b border-border px-5 pb-3">
            <h2
              id="mobile-runs-sheet-title"
              data-mobile-runs-sheet-title
              class="flex items-center gap-2 text-[18px] font-semibold"
            >
              <StatusBadge status={selectedRun.status} />
              <span class="min-w-0 break-words">{selectedRun.title}</span>
            </h2>
            <p
              data-mobile-runs-sheet-meta
              class="flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted-foreground"
            >
              <span>{selectedRun.taskKey}</span>
              <span aria-hidden="true">·</span>
              <span>{selectedRun.agent}</span>
              <span aria-hidden="true">·</span>
              <span>{selectedRun.step}</span>
              <span aria-hidden="true">·</span>
              <span>{selectedRun.elapsed}</span>
            </p>
            <div class="pt-0.5">
              <ModeRow
                density="compact"
                bind:value={feedModes[selectedRun.runId]}
                class="w-full"
              />
            </div>
          </div>

          <!-- sheet body: inline permission prompt + tool cards -->
          <div
            data-mobile-runs-sheet-body
            class="flex min-h-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden px-5 py-3"
          >
            {#if selectedDetail.permission}
              <!--
                Inline permission prompt: DESIGN.md §8: one button per
                option, never modal except for irreversible ops. The action
                bar below carries one button per option.
              -->
              <div
                data-mobile-runs-permission
                data-resolved={permissionDecision ? "true" : "false"}
                class="flex gap-2 rounded-md border border-warning/40 bg-warning/15 p-3"
              >
                <span aria-hidden="true" class="text-warning-foreground">⚠</span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-warning-foreground">
                    {selectedDetail.permission.tool} needs approval
                  </p>
                  <code
                    data-mobile-runs-permission-command
                    class="mt-1 block break-words font-mono text-[11px] text-muted-foreground"
                  >
                    {selectedDetail.permission.command}
                  </code>
                  {#if permissionDecision}
                    <p
                      data-mobile-runs-permission-decision
                      class="mt-1.5 text-[11px] font-medium text-foreground"
                    >
                      Decision: {permissionDecision}
                    </p>
                  {/if}
                </div>
              </div>
            {/if}

            {#each selectedDetail.tools as tool (tool.name)}
              <article
                data-mobile-runs-tool-card={tool.name}
                data-open={tool.open ? "true" : "false"}
                class="overflow-hidden rounded-md border border-border bg-background"
              >
                <div class="flex items-center gap-2 border-b border-border px-3 py-2">
                  <StatusBadge status={tool.status} />
                  <span class="font-mono text-xs font-medium">{tool.name}</span>
                  <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                    {tool.args}
                  </span>
                  <span aria-hidden="true" class="text-muted-foreground">›</span>
                </div>
                {#if tool.open && tool.diff}
                  <div class="px-3 py-2 font-mono text-[11px]">
                    <p class="text-muted-foreground">@@ tool diff @@</p>
                    {#each tool.diff as line (line.n)}
                      <div
                        data-mobile-runs-diff-line={line.kind}
                        class={cn(
                          "flex gap-2",
                          line.kind === "add" && "text-success",
                          line.kind === "del" && "text-destructive",
                          line.kind === "ctx" && "text-muted-foreground",
                        )}
                      >
                        <span class="w-4 shrink-0 text-right text-muted-foreground">{line.n}</span>
                        <span class="break-words">{line.text}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
                {#if tool.open && tool.log}
                  <pre
                    data-mobile-runs-tool-log
                    class="whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] text-muted-foreground"
                  >{tool.log}</pre>
                {/if}
              </article>
            {/each}

            {#if !selectedDetail.permission && selectedDetail.tools.length === 0}
              <p data-mobile-runs-sheet-quiet class="text-xs text-muted-foreground">
                No pending approvals: this run is streaming without operator input.
              </p>
            {/if}
          </div>

          <!-- sticky action bar -->
          {#if selectedDetail.permission}
            <div
              data-mobile-runs-sheet-actions
              class="flex gap-2 border-t border-border bg-card px-4 py-3"
            >
              {#each selectedDetail.permission.options as option (option.key)}
                <Button
                  type="button"
                  variant={option.primary
                    ? "default"
                    : option.tone === "ghost"
                      ? "ghost"
                      : "secondary"}
                  data-mobile-runs-permission-option={option.key}
                  aria-pressed={permissionDecision === option.key}
                  class="h-11 flex-1 justify-center"
                  onclick={() => decidePermission(option.key)}
                >
                  {option.label}
                </Button>
              {/each}
            </div>
          {:else}
            <div
              data-mobile-runs-sheet-actions
              class="flex gap-2 border-t border-border bg-card px-4 py-3"
            >
              <Button
                type="button"
                variant="secondary"
                data-mobile-runs-sheet-close
                class="h-11 flex-1 justify-center"
                onclick={closeSheet}
              >
                Close
              </Button>
            </div>
          {/if}
        </aside>
      </div>
    {/if}

    <!-- six-icon bottom tab bar: IA-MAP.md §617 -->
    <nav
      data-mobile-runs-tab-bar
      aria-label="Workflow stages"
      class="grid grid-cols-6 border-t border-border bg-card"
    >
      {#each STAGE_TABS as tab (tab.key)}
        <a
          href={tab.href}
          data-mobile-stage-tab={tab.key}
          aria-current={tab.key === CURRENT_STAGE ? "page" : undefined}
          class={cn(
            "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px]",
            "no-underline transition-colors",
            tab.key === CURRENT_STAGE
              ? "text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span aria-hidden="true" class="text-base leading-none">{tab.glyph}</span>
          <span>{tab.label}</span>
        </a>
      {/each}
    </nav>

    <!-- iOS home indicator -->
    <span
      aria-hidden="true"
      class="absolute bottom-2 left-1/2 h-[5px] w-[140px] -translate-x-1/2 rounded-full bg-foreground/60"
    ></span>
  </section>
</div>

<style>
  @keyframes mobile-sheet-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-mobile-runs-sheet] {
      animation: none !important;
    }
  }
</style>

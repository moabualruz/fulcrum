<script lang="ts">
  /**
   * Build runs feed + live session pane — OD `build-runs.html` fidelity surface.
   *
   * DESIGN.md §9 (run feed), §8 (Live Session Pane: list / sticky plan strip /
   * transcript / workspace dock), §4.5 (tool-call cards), §4.6 (inline diff),
   * §4.10 (trace badge). IA-MAP.md §2.3 routes this at
   * `/<ws>/projects/<projId>/build/runs` and `/.../build/runs/<runId>`; this
   * design-e2e fixture route renders the canonical two-column `runs-shell`
   * (scrollable feed + selected-run live session pane) so the OD surface is
   * proven before the production stage route consumes it.
   *
   * Absorbs the six legacy `run-*` fixture routes — pause/stop, retry policy,
   * retry prompt, fork-from-turn, rate limits, and the cost strip are inline
   * states of this one pane, not separate routes.
   */
  import { page } from "$app/stores";
  import {
    Badge,
    Button,
    EmptyState,
    LoadingState,
    ModeRow,
    RunFeedItem,
    StatusBadge,
    TraceChip,
    type WorkflowMode,
    type WorkflowStatus,
  } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  type SparkTone = "ok" | "warn" | "bad" | "run";
  type FeedRun = {
    runId: string;
    taskKey: string;
    title: string;
    agent: string;
    status: WorkflowStatus;
    age: string;
    spark?: { tone: SparkTone; height: number }[];
  };

  /** Per-task event timeline rows (DESIGN.md §9 run feed). */
  const feedRuns: FeedRun[] = [
    {
      runId: "run_8f29a4c",
      taskKey: "AUTH-43",
      title: "Persist issuance row per kid",
      agent: "opus-4.7",
      status: "running",
      age: "3m",
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
    },
    {
      runId: "run_91b0072",
      taskKey: "AUTH-47",
      title: "Rate-limiter · bucket per kid",
      agent: "opus-4.7",
      status: "running",
      age: "1m",
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
    },
    {
      runId: "run_3df8801",
      taskKey: "AUTH-42",
      title: "Add kid + rotate flag to signToken",
      agent: "opus-4.7",
      status: "completed",
      age: "25m",
    },
    {
      runId: "run_56e3d12",
      taskKey: "OBS-12",
      title: "Dedupe trace-id propagation",
      agent: "opus-4.7",
      status: "failed",
      age: "1h",
      spark: [
        { tone: "ok", height: 8 },
        { tone: "ok", height: 10 },
        { tone: "warn", height: 14 },
        { tone: "bad", height: 16 },
      ],
    },
    {
      runId: "run_82a7f33",
      taskKey: "SPIKE-4",
      title: "Spike · replace zod with valibot",
      agent: "sonnet-4.6",
      status: "cancelled",
      age: "3h",
    },
    {
      runId: "run_07f2e1d",
      taskKey: "DB-9",
      title: "Prisma migrate stuck on shadow db",
      agent: "gpt-5.4",
      status: "blocked",
      age: "31m",
    },
  ];

  const SPARK_TONE: Record<SparkTone, string> = {
    ok: "bg-[var(--success)]",
    warn: "bg-[var(--warning)]",
    bad: "bg-[var(--destructive)]",
    run: "bg-[var(--accent)]",
  };

  /** Protocol `tool_call` transcript shape (DESIGN.md §4.5). */
  type DiffLine = { kind: "ctx" | "add" | "del"; n: string; text: string };
  type ToolCall = {
    id: string;
    name: string;
    status: WorkflowStatus;
    args: string;
    open: boolean;
    body?: string;
    hunkHead?: string;
    diff?: DiffLine[];
  };
  type SessionStep = {
    num: number;
    title: string;
    status: WorkflowStatus;
    age: string;
    toolCalls: ToolCall[];
  };

  const sessionSteps: SessionStep[] = [
    {
      num: 1,
      title: "Read session.ts and call sites",
      status: "completed",
      age: "11:24:14 · 6s",
      toolCalls: [
        {
          id: "tc-1",
          name: "read_file",
          status: "completed",
          args: "src/auth/session.ts · 0–240",
          open: false,
          body: '{"path":"src/auth/session.ts","range":[0,240]}',
        },
        {
          id: "tc-2",
          name: "grep",
          status: "completed",
          args: "signToken|verifyToken · src/",
          open: false,
          body: "14 matches across 9 files (truncated)",
        },
      ],
    },
    {
      num: 2,
      title: "Add kid + rotate flag to signToken",
      status: "completed",
      age: "11:24:33 · 24s",
      toolCalls: [
        {
          id: "tc-3",
          name: "edit_file",
          status: "completed",
          args: "src/auth/session.ts · 1 hunk",
          open: true,
          hunkHead: "@@ -42,7 +42,12 @@",
          diff: [
            { kind: "ctx", n: "42", text: "export function newSession(req: Req) {" },
            { kind: "del", n: "43", text: "  const t = signToken(req.user);" },
            {
              kind: "add",
              n: "43",
              text: "  const t = signToken(req.user, { rotate: true, kid: uuid() });",
            },
            { kind: "ctx", n: "44", text: "  return { token: t.jwt, exp: t.exp };" },
            { kind: "ctx", n: "45", text: "}" },
          ],
        },
      ],
    },
    {
      num: 3,
      title: "Persist issuance row per kid (ip, ua, ts)",
      status: "running",
      age: "11:25:14 · streaming",
      toolCalls: [
        {
          id: "tc-4",
          name: "edit_file",
          status: "completed",
          args: "src/auth/issuance.repo.ts · 2 hunks",
          open: true,
          hunkHead: "@@ -1,0 +1,18 @@ new file",
          diff: [
            { kind: "add", n: "1", text: 'import { db } from "../db"' },
            {
              kind: "add",
              n: "2",
              text: "export interface Issuance { kid: string; userId: string; ip: string; ua: string; ts: Date; }",
            },
            { kind: "add", n: "3", text: "export async function record(i: Issuance) {" },
            { kind: "add", n: "4", text: "  await db.issuance.create({ data: i })" },
            { kind: "add", n: "5", text: "}" },
          ],
        },
        {
          id: "tc-5",
          name: "shell.run",
          status: "running",
          args: "pnpm test --filter auth · 12s",
          open: false,
          body: "$ pnpm test --filter auth\n   Tests:       42 passed, 4 running …",
        },
      ],
    },
  ];

  /** Pending steps render dimmed (DESIGN.md §8 transcript). */
  const pendingSteps = [
    { num: 4, title: "verifyToken · lookup kid + dual-verify legacy" },
    { num: 5, title: "Wire revocation endpoint" },
  ];

  /** Checkpoint timeline rows (DESIGN.md §8). */
  const checkpoints = [
    { id: "ck-3", label: "After issuance repo edit", turn: 6, time: "11:25:01", current: true },
    { id: "ck-2", label: "After signToken edit", turn: 4, time: "11:24:57", current: false },
    { id: "ck-1", label: "Session start", turn: 1, time: "11:24:08", current: false },
  ];

  const dockTabs = ["Shell", "Files", "Browser", "Plan", "Cost"] as const;
  const abortReasons = ["user-cancel", "dangerous-output", "wrong-context", "cost-cap"] as const;

  // --- live UI state -------------------------------------------------------
  const emptyState = $derived($page.url.searchParams.get("state") === "empty");
  const loadingState = $derived($page.url.searchParams.get("state") === "loading");

  let live = $state(true);
  let selectedRunId = $state(feedRuns[0]?.runId ?? "");
  let activeDock = $state<(typeof dockTabs)[number]>("Shell");
  let permissionResolved = $state(false);
  let abortOpen = $state(false);
  let paused = $state(false);
  let openCards = $state<Record<string, boolean>>(
    Object.fromEntries(
      sessionSteps.flatMap((s) => s.toolCalls.map((c) => [c.id, c.open])),
    ),
  );

  const selectedRun = $derived(
    feedRuns.find((r) => r.runId === selectedRunId) ?? feedRuns[0],
  );

  function selectRun(runId: string): void {
    selectedRunId = runId;
  }

  function toggleCard(id: string): void {
    openCards = { ...openCards, [id]: !openCards[id] };
  }

  // Mode-row state is per-row; the feed mirrors the OD compact mode row.
  let feedModes = $state<Record<string, WorkflowMode>>(
    Object.fromEntries(feedRuns.map((r) => [r.runId, "manual" as WorkflowMode])),
  );
  let sessionMode = $state<WorkflowMode>("manual");
</script>

<svelte:head><title>Build runs feed | Fulcrum</title></svelte:head>

<div
  data-build-runs-shell
  class={cn(
    "grid h-full min-h-0 w-full overflow-hidden",
    "grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]",
  )}
>
  <!-- LEFT — runs feed (DESIGN.md §9) -->
  <aside
    class={cn(
      "flex min-h-0 min-w-0 flex-col border-b border-border bg-muted/20",
      "lg:border-b-0 lg:border-r",
    )}
  >
    <div
      data-runs-feed-head
      class={cn(
        "flex items-center gap-2 border-b border-border bg-card px-3 py-2",
        "text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
      )}
    >
      <span>Recent runs · 12</span>
      <span class="flex-1"></span>
      <button
        type="button"
        data-runs-live-toggle
        aria-pressed={live}
        onclick={() => (live = !live)}
        class={cn(
          "inline-flex h-6 items-center gap-1 rounded-sm border border-border px-2",
          "text-[11px] font-medium transition-colors",
          live ? "bg-accent/15 text-accent-foreground" : "bg-background text-muted-foreground",
        )}
      >
        <span aria-hidden="true">⏵</span> Live
      </button>
    </div>

    {#if loadingState}
      <div data-runs-loading class="p-4">
        <LoadingState
          title="Loading Build runs"
          description="Fetching run feed, selected transcript, and live dock state."
          shape="feed"
          rows={5}
        />
      </div>
    {:else if emptyState}
      <div data-runs-empty class="p-6">
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
      <div data-runs-feed data-live={live} class="min-h-0 flex-1 overflow-y-auto">
        {#each feedRuns as run (run.runId)}
          <!--
            Each run row: the OD `.run-row`. `RunFeedItem` is the canonical
            ui-kit identity block (status badge · title · task key · agent);
            the run-feed-specific age, monospace ids, sparkline and per-row
            mode row compose around it as the OD row affordances.
          -->
          <div
            data-run-row
            data-run-id={run.runId}
            data-status={run.status}
            aria-current={run.runId === selectedRunId ? "true" : undefined}
            role="button"
            tabindex="0"
            onclick={() => selectRun(run.runId)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectRun(run.runId);
              }
            }}
            class={cn(
              "flex cursor-pointer flex-col gap-1.5 border-b border-border px-1",
              "transition-colors hover:bg-card/60",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              run.runId === selectedRunId &&
                "bg-card shadow-[inset_2px_0_0_var(--accent)]",
            )}
          >
            <RunFeedItem
              runId={run.runId}
              taskKey={run.taskKey}
              taskTitle={run.title}
              agentName={run.agent}
              status={run.status}
              class="border-b-0 px-3 py-2"
            />
            <div class="flex flex-col gap-1.5 px-3 pb-2.5">
              <div
                class="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground"
              >
                <span data-run-row-age>{run.age}</span>
                <span aria-hidden="true">·</span>
                <span data-run-row-id>{run.runId}</span>
                <span aria-hidden="true">·</span>
                <span data-run-row-task>{run.taskKey}</span>
                <span aria-hidden="true">·</span>
                <span data-run-row-agent>{run.agent}</span>
              </div>
              {#if run.spark}
                <div
                  data-run-sparkline
                  class="flex h-4 items-end gap-0.5"
                  aria-label="Recent step outcomes"
                >
                  {#each run.spark as bar, i (i)}
                    <span
                      data-spark-bar
                      data-spark-tone={bar.tone}
                      class={cn("w-1.5 rounded-[1px]", SPARK_TONE[bar.tone])}
                      style={`height:${bar.height}px`}
                    ></span>
                  {/each}
                </div>
              {/if}
              <ModeRow
                density="compact"
                bind:value={feedModes[run.runId]}
                class="w-full"
              />
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </aside>

  <!-- RIGHT — live session pane (DESIGN.md §8) -->
  <section
    data-live-session-pane
    class="flex min-h-0 min-w-0 flex-col overflow-y-auto bg-background"
  >
    {#if loadingState}
      <div data-live-session-loading class="flex flex-1 items-center justify-center p-8">
        <LoadingState
          title="Loading live session"
          description="Fetching tool calls, checkpoints, and workspace context."
          shape="panel"
        />
      </div>
    {:else if emptyState}
      <div class="flex flex-1 items-center justify-center p-8">
        <p class="text-sm text-muted-foreground">
          Select or dispatch a run to open its live session.
        </p>
      </div>
    {:else}
      <!-- sticky session head -->
      <header
        data-session-head
        class={cn(
          "sticky top-0 z-10 flex flex-wrap items-center gap-2.5",
          "border-b border-border bg-card px-4 py-2.5",
        )}
      >
        <StatusBadge status={selectedRun.status} />
        <h1 class="flex-1 truncate text-base font-semibold">
          {selectedRun.taskKey} · {selectedRun.title}
        </h1>
        <TraceChip
          traceId="tr_8f29a4c1b3e0d5f7"
          badge
          project="fulcrum"
          cycle="24w13"
          timestamp="11:24:08"
        />
        <Button
          variant="ghost"
          size="sm"
          data-session-pause
          onclick={() => (paused = !paused)}
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          data-session-stop
          onclick={() => (abortOpen = true)}
        >
          ⏹ Stop
        </Button>
        <ModeRow density="compact" bind:value={sessionMode} />
      </header>

      <!-- paused queue indicator (absorbs run-cancel pause state) -->
      {#if paused}
        <div
          data-pause-queue
          class={cn(
            "flex items-center gap-2 border-b border-border bg-warning/10 px-4 py-1.5",
            "text-xs text-muted-foreground",
          )}
        >
          <span aria-hidden="true">⏸</span>
          <span>Paused · 2 prompts queued — resume to continue the session.</span>
        </div>
      {/if}

      <!-- rate-limit notice (absorbs run-rate-limits) -->
      <div
        data-run-rate-limits
        class={cn(
          "flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-1.5",
          "text-xs text-muted-foreground",
        )}
      >
        <span aria-hidden="true">◷</span>
        <span>Rate limit: 38 / 50 requests this minute · throttle inactive.</span>
      </div>

      <!-- sticky mono strip (absorbs run-cost-tracking spend segment) -->
      <div
        data-session-strip
        class={cn(
          "flex flex-wrap gap-3 border-b border-border bg-muted/20 px-4 py-2.5",
          "font-mono text-xs text-muted-foreground",
        )}
      >
        <span class="flex items-center gap-1.5">run <b class="text-foreground">run_8f29a4c</b></span>
        <span class="flex items-center gap-1.5">agent <b class="text-foreground">opus-4.7</b></span>
        <span class="flex items-center gap-1.5">policy <b class="text-foreground">ask-on-write</b></span>
        <span class="flex items-center gap-1.5">tokens in <b class="text-foreground">12 480</b></span>
        <span class="flex items-center gap-1.5">out <b class="text-foreground">4 312</b></span>
        <span class="flex items-center gap-1.5">spend <b class="text-foreground">$0.43</b></span>
        <span class="flex items-center gap-1.5">started <b class="text-foreground">11:24:08</b></span>
        <span class="flex-1"></span>
        <span class="flex items-center gap-1.5">step <b class="text-foreground">3 / 8</b></span>
      </div>

      <!-- sticky plan strip (DESIGN.md §8) -->
      <div
        data-session-plan-strip
        class={cn(
          "sticky top-[57px] z-[5] flex items-center gap-2 border-b border-border",
          "bg-card px-4 py-1.5 text-xs",
        )}
      >
        <Badge variant="secondary">Plan</Badge>
        <span class="text-muted-foreground">
          Issuance tracking — step 3 of 8 · 2 done · 1 running · 5 queued
        </span>
      </div>

      <!-- session controls absorbed from run-fork / run-retry-* fixtures -->
      <div
        class={cn(
          "flex flex-wrap gap-2 border-b border-border bg-background px-4 py-2",
        )}
      >
        <Button variant="outline" size="sm" data-run-fork>Fork from this turn</Button>
        <Button variant="outline" size="sm" data-run-retry-policy>Retry policy</Button>
        <Button variant="outline" size="sm" data-run-retry-prompt>Retry with prompt</Button>
      </div>

      <!-- transcript -->
      <div class="flex flex-1 flex-col gap-3 p-4">
        {#each sessionSteps as step (step.num)}
          <article class="overflow-hidden rounded-sm border border-border bg-card">
            <header
              class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-sm"
            >
              <span
                class={cn(
                  "inline-flex h-[18px] w-[18px] items-center justify-center rounded-full",
                  "font-mono text-[10px]",
                  step.status === "completed" && "bg-success/20 text-success",
                  step.status === "running" && "bg-accent/20 text-accent-foreground",
                  step.status !== "completed" &&
                    step.status !== "running" &&
                    "border border-border bg-muted text-muted-foreground",
                )}
              >
                {step.num}
              </span>
              <StatusBadge status={step.status} />
              <span class="flex-1 font-medium">{step.title}</span>
              <span class="font-mono text-[10px] text-muted-foreground">{step.age}</span>
            </header>
            <div class="flex flex-col gap-2 p-3">
              <!-- inline permission prompt on the running step (DESIGN.md §8) -->
              {#if step.status === "running" && !permissionResolved}
                <div
                  data-permission-prompt
                  class={cn(
                    "flex flex-wrap items-center gap-2 rounded-sm border border-warning/40",
                    "bg-warning/10 px-3 py-2 text-xs",
                  )}
                >
                  <span aria-hidden="true" class="text-warning">⚠</span>
                  <div class="min-w-0 flex-1">
                    <strong class="block">shell.run requires approval</strong>
                    <code class="font-mono text-[11px] text-muted-foreground">
                      pnpm prisma migrate dev --name sessions_kid --create-only
                    </code>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    data-permission-option="deny"
                    onclick={() => (permissionResolved = true)}
                  >
                    Deny
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-permission-option="allow-once"
                    onclick={() => (permissionResolved = true)}
                  >
                    Allow once
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    data-permission-option="allow-always"
                    onclick={() => (permissionResolved = true)}
                  >
                    Always allow this command
                  </Button>
                </div>
              {/if}

              {#each step.toolCalls as call (call.id)}
                <article
                  data-tool-call-card={call.name}
                  data-open={openCards[call.id]}
                  class="overflow-hidden rounded-sm border border-border bg-background"
                >
                  <header
                    class="flex items-center gap-2 px-3 py-1.5 text-xs"
                  >
                    <StatusBadge status={call.status} />
                    <span class="font-mono font-medium">{call.name}</span>
                    <span class="flex-1 truncate font-mono text-[11px] text-muted-foreground">
                      {call.args}
                    </span>
                    <button
                      type="button"
                      data-tool-call-expand
                      aria-expanded={openCards[call.id]}
                      aria-label={`${openCards[call.id] ? "Collapse" : "Expand"} ${call.name} tool call`}
                      onclick={() => toggleCard(call.id)}
                      class={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-sm",
                        "text-muted-foreground transition-transform hover:bg-muted",
                        openCards[call.id] && "rotate-90",
                      )}
                    >
                      ›
                    </button>
                  </header>
                  {#if openCards[call.id]}
                    <div
                      data-tool-call-body
                      class="border-t border-border bg-muted/20 px-3 py-2"
                    >
                      {#if call.diff}
                        <!-- inline file diff (DESIGN.md §4.6) -->
                        <div
                          data-inline-diff
                          class="overflow-hidden rounded-sm border border-border font-mono text-[11px]"
                        >
                          <div
                            class={cn(
                              "flex items-center gap-2 bg-muted px-2 py-1",
                              "text-[10px] text-muted-foreground",
                            )}
                          >
                            <span>{call.hunkHead}</span>
                            <span class="flex-1"></span>
                            <button
                              type="button"
                              data-diff-reject
                              class="rounded-sm border border-border px-1.5 py-0.5 hover:bg-background"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              data-diff-accept
                              class={cn(
                                "rounded-sm border border-transparent bg-accent/20 px-1.5 py-0.5",
                                "text-accent-foreground hover:bg-accent/30",
                              )}
                            >
                              Accept ↵
                            </button>
                          </div>
                          {#each call.diff as line, i (i)}
                            <div
                              data-diff-line={line.kind}
                              class={cn(
                                "flex gap-2 px-2 py-0.5",
                                line.kind === "add" && "bg-success/10 text-success",
                                line.kind === "del" && "bg-destructive/10 text-destructive",
                              )}
                            >
                              <span class="w-8 text-right text-muted-foreground">{line.n}</span>
                              <code class="min-w-0 flex-1 break-words">{line.text}</code>
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <pre class="overflow-x-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{call.body}</pre>
                      {/if}
                    </div>
                  {/if}
                </article>
              {/each}
            </div>
          </article>
        {/each}

        {#each pendingSteps as step (step.num)}
          <article
            class="overflow-hidden rounded-sm border border-border bg-card opacity-60"
          >
            <header class="flex items-center gap-2 px-3 py-2 text-sm">
              <span
                class={cn(
                  "inline-flex h-[18px] w-[18px] items-center justify-center rounded-full",
                  "border border-border bg-muted font-mono text-[10px] text-muted-foreground",
                )}
              >
                {step.num}
              </span>
              <StatusBadge status="queued" />
              <span class="flex-1 font-medium">{step.title}</span>
              <span class="font-mono text-[10px] text-muted-foreground">queued</span>
            </header>
          </article>
        {/each}

        <!-- checkpoint timeline (DESIGN.md §8) -->
        <section
          data-checkpoint-timeline
          class="rounded-sm border border-border bg-card"
        >
          <header
            class={cn(
              "border-b border-border px-3 py-2 text-[10px] font-semibold uppercase",
              "tracking-[0.06em] text-muted-foreground",
            )}
          >
            Checkpoints
          </header>
          <ul class="flex flex-col">
            {#each checkpoints as ck, i (ck.id)}
              <li
                data-checkpoint-row
                data-checkpoint-current={ck.current}
                class={cn(
                  "flex flex-wrap items-center gap-2 px-3 py-2 text-xs",
                  i < checkpoints.length - 1 && "border-b border-border",
                )}
              >
                <span aria-hidden="true" class="text-muted-foreground">◳</span>
                <span class="font-medium">{ck.label}</span>
                <span class="font-mono text-[10px] text-muted-foreground">
                  turn {ck.turn} · {ck.time}
                </span>
                {#if ck.current}
                  <Badge variant="secondary">current</Badge>
                {/if}
                <span class="flex-1"></span>
                {#if ck.current}
                  <Button variant="outline" size="sm" data-checkpoint-resume>
                    Resume from checkpoint
                  </Button>
                {:else}
                  <Button variant="ghost" size="sm" data-checkpoint-fork>
                    Fork into new session?
                  </Button>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      </div>

      <!-- workspace dock (DESIGN.md §8: Shell · Files · Browser · Plan · Cost) -->
      <div
        data-workspace-dock
        class="border-t border-border bg-card"
      >
        <div role="tablist" aria-label="Workspace dock" class="flex border-b border-border">
          {#each dockTabs as tab (tab)}
            <button
              type="button"
              role="tab"
              data-dock-tab
              aria-selected={activeDock === tab}
              onclick={() => (activeDock = tab)}
              class={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                activeDock === tab
                  ? "border-b-2 border-accent text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab}
            </button>
          {/each}
        </div>
        <div
          role="tabpanel"
          data-dock-panel={activeDock}
          class="px-3 py-2 font-mono text-[11px] text-muted-foreground"
        >
          {#if activeDock === "Cost"}
            Spend $0.43 · in 12 480 · out 4 312 · budget $5.00
          {:else if activeDock === "Files"}
            2 files touched · src/auth/session.ts · src/auth/issuance.repo.ts
          {:else if activeDock === "Browser"}
            No browser session attached to this run.
          {:else if activeDock === "Plan"}
            Issuance tracking · 8 steps · 2 done · 1 running
          {:else}
            $ pnpm test --filter auth · 42 passed, 4 running
          {/if}
        </div>
      </div>
    {/if}
  </section>
</div>

<!-- abort modal — irreversible Stop (DESIGN.md §8) -->
{#if abortOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    role="presentation"
    onclick={() => (abortOpen = false)}
  >
    <div
      data-abort-modal
      role="dialog"
      aria-modal="true"
      aria-label="Abort run"
      class="w-[400px] max-w-full rounded-md border border-border bg-card p-4 shadow-lg"
      onclick={(e) => e.stopPropagation()}
    >
      <h2 class="text-sm font-semibold">Stop this run?</h2>
      <p class="mt-1 text-xs text-muted-foreground">
        Stopping AI Assist ends the active run. This cannot be undone.
      </p>
      <label class="mt-3 block text-xs font-medium" for="abort-reason">Reason</label>
      <select
        id="abort-reason"
        data-abort-reason
        class={cn(
          "border-input bg-background mt-1 flex h-9 w-full rounded-md border px-3 py-1 text-sm",
        )}
      >
        {#each abortReasons as reason (reason)}
          <option value={reason}>{reason}</option>
        {/each}
      </select>
      <label class="mt-3 block text-xs font-medium" for="abort-note">Note</label>
      <textarea
        id="abort-note"
        data-abort-note
        rows="2"
        class={cn(
          "border-input bg-background mt-1 flex w-full rounded-md border px-3 py-1.5 text-sm",
        )}
        placeholder="Why is this run being stopped?"
      ></textarea>
      <div class="mt-4 flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          data-abort-cancel
          onclick={() => (abortOpen = false)}
        >
          Keep running
        </Button>
        <Button
          variant="destructive"
          size="sm"
          data-abort-confirm
          onclick={() => (abortOpen = false)}
        >
          Stop run
        </Button>
      </div>
    </div>
  </div>
{/if}

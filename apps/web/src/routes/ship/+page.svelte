<script lang="ts">
  /**
   * Ship stage workbench — OD `ship.html` fidelity surface.
   *
   * IA-MAP.md §2.5 routes the Ship stage at `/<ws>/projects/<projId>/ship`;
   * this design-e2e fixture route renders the canonical Ship workbench so the
   * OD surface is proven before the production stage route consumes it. The
   * legacy generic `/artifacts` file manager is re-homed here — its
   * `+page.svelte` 301-redirects to `/ship` (no feature loss: the bulk
   * archive/delete server action and the `/artifacts/[id]/download` endpoint
   * stay reachable at their `/artifacts/[id]` paths).
   *
   * OD components rebuilt 1:1:
   *  - `.toolbar` — stage title `Artifacts`, mono sub-line, a segmented
   *    Channel / Sort / Filter group, and the gradient `Cut release` primary
   *    action carrying the `⌘R` (`Mod+R`) keyboard hint (DESIGN.md §356 mode
   *    affordances drive the per-row ModeRow, not this toolbar).
   *  - `table.runs` — the release table: ribbon · Artifact · Channel · Status ·
   *    Checks · Author · Promoted · Trace · Size · Modes, with `aria-current`
   *    on the focused release row and the four-mode ModeRow per row.
   *  - `.peek` — the DESIGN.md §197 List+Detail peek-overview panel: a
   *    right-anchored 50%-width panel on desktop / full-width sheet on mobile,
   *    opened on row click *without a route change*, with Release / Checks /
   *    Includes / Timeline sections and a Roll back / Pause rollout / Open run
   *    feed / Promote action bar.
   *
   * Confirmation tiers (COPY.md §4): `Cut release`, `Pause rollout`, and
   * `Promote to 100%` are reversible operational actions → the
   * destructive-without-text-confirm inline 3-2-1 countdown tier; `Roll back`
   * reverts a live rollout and is the destructive tier with an explicit inline
   * confirm step (COPY.md §4 "destructive without text confirm" — single
   * inline confirm, `Esc` cancels, no modal because it is not irreversible).
   *
   * This is a backend-bearing surface: the release / channel / rollout domain
   * model does not exist in the codebase yet, so the rows below are the
   * fixture projection of that future model (PRD problem statement).
   */
  import { page } from "$app/state";
  import {
    Button,
    EmptyState,
    ModeRow,
    StatusBadge,
    TraceChip,
    type WorkflowMode,
    type WorkflowStatus,
  } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  /** Channel a release is promoted on (OD `ship.html` Channel column). */
  type Channel = "stable" | "canary";

  /** A check row inside the peek `Checks` section. */
  type ReleaseCheck = {
    name: string;
    ok: boolean;
    age: string;
  };

  /** A promotion-timeline event inside the peek `Timeline` section. */
  type TimelineEvent = {
    t: string;
    text: string;
  };

  /** A merged change inside the peek `Includes` section. */
  type IncludedChange = {
    summary: string;
    ref: string;
  };

  /**
   * A Ship release. Releases — not raw files — are the Ship unit
   * (CLI-TUI-UX.md §Ship, `design-alignment/ship.md`). The release / channel /
   * rollout domain model is unowned scope flagged by the PRD; these rows are
   * its fixture projection.
   */
  type Release = {
    id: string;
    artifact: string;
    channel: Channel;
    status: WorkflowStatus;
    /** Mono qualifier shown beside the status badge (OD `.desc`). */
    desc: string;
    /** In-flight rollouts get the OD `▶` ribbon marker. */
    inFlight: boolean;
    checksOk: number;
    checksFail: number;
    author: string;
    promoted: string;
    trace: string;
    size: string;
    /** Peek `Release` section key-value rows. */
    release: { k: string; v: string }[];
    checks: ReleaseCheck[];
    includes: IncludedChange[];
    timeline: TimelineEvent[];
    /** Peek head crumbs + sub-line. */
    crumbs: string;
    sub: string;
  };

  /**
   * OD `ship.html` body — seven releases, verbatim artifact names, channels,
   * authors, traces, sizes. OD status strings map onto the canonical COPY.md
   * §6 / DESIGN.md §13 eight-state vocabulary: `running`→`running`,
   * `completed`→`completed`, `cancelled`→`cancelled`, `failing`→`failing`.
   */
  const releases: Release[] = [
    {
      id: "fulcrum-server@0.18.0",
      artifact: "fulcrum-server 0.18.0",
      channel: "stable",
      status: "running",
      desc: "rolling out · 38%",
      inFlight: true,
      checksOk: 12,
      checksFail: 1,
      author: "mk → agent gemini-3-pro",
      promoted: "11:42 · 12 min ago",
      trace: "tr_d92e081f",
      size: "38.4 MB",
      crumbs: "ship · stable · fulcrum-server",
      sub: "promoted by mk via plan_auth-rewrite · 12 min ago · target 100% by 12:30",
      release: [
        { k: "version", v: "0.18.0" },
        { k: "channel", v: "stable" },
        { k: "promoted at", v: "2026-05-17T11:42:08Z" },
        { k: "rollout", v: "38% (1.5k / 4k clients)" },
        { k: "artifact sha", v: "sha256:d92e0…ee04" },
        { k: "build trace", v: "tr_d92e081fccae" },
      ],
      checks: [
        { name: "unit (auth, limit, obs)", ok: true, age: "passed · 1m 24s" },
        { name: "e2e (login → rotate → revoke)", ok: true, age: "passed · 4m 02s" },
        { name: "canary 1% · 30 min", ok: true, age: "no SLO regression" },
        {
          name: "contract (auth.session.issued schema)",
          ok: false,
          age: "downgraded · non-blocking · ticketed",
        },
      ],
      includes: [
        { summary: "feat(auth): rotate session token per device", ref: "#4218" },
        { summary: "feat(limit): per-kid rate buckets", ref: "#4221" },
        { summary: "fix(obs): backfill trace-id on background jobs", ref: "#4209" },
        { summary: "chore(deps): bump prisma 5.6 → 5.7", ref: "#4214" },
      ],
      timeline: [
        { t: "11:42:08", text: "promoted from canary by mk" },
        { t: "11:43:01", text: "rolled to 1% (40 clients)" },
        { t: "11:48:14", text: "auto-promoted to 10% · error budget unchanged" },
        { t: "11:54:09", text: "auto-promoted to 38%" },
        { t: "11:54:11", text: "p99 latency +4 ms (within budget)" },
      ],
    },
    {
      id: "fulcrum-cli@0.18.0",
      artifact: "fulcrum-cli 0.18.0",
      channel: "stable",
      status: "completed",
      desc: "deployed",
      inFlight: false,
      checksOk: 14,
      checksFail: 0,
      author: "mk",
      promoted: "11:38 · 16 min",
      trace: "tr_a01b9223",
      size: "12.1 MB",
      crumbs: "ship · stable · fulcrum-cli",
      sub: "promoted by mk · 16 min ago · deployed to 100%",
      release: [
        { k: "version", v: "0.18.0" },
        { k: "channel", v: "stable" },
        { k: "promoted at", v: "2026-05-17T11:38:00Z" },
        { k: "rollout", v: "100% (deployed)" },
        { k: "artifact sha", v: "sha256:a01b9…7c12" },
        { k: "build trace", v: "tr_a01b9223de51" },
      ],
      checks: [
        { name: "unit (cli command tree)", ok: true, age: "passed · 0m 51s" },
        { name: "e2e (init → install → doctor)", ok: true, age: "passed · 2m 18s" },
      ],
      includes: [
        { summary: "feat(cli): ship stage command group", ref: "#4231" },
        { summary: "fix(cli): trace id propagation in --json", ref: "#4226" },
      ],
      timeline: [
        { t: "11:38:00", text: "promoted from canary by mk" },
        { t: "11:39:40", text: "rolled to 100% · no SLO regression" },
      ],
    },
    {
      id: "fulcrum-acp-bridge@0.4.2",
      artifact: "fulcrum-acp-bridge 0.4.2",
      channel: "stable",
      status: "completed",
      desc: "deployed",
      inFlight: false,
      checksOk: 9,
      checksFail: 0,
      author: "agent gpt-5.4",
      promoted: "10:51",
      trace: "tr_55014df1",
      size: "4.7 MB",
      crumbs: "ship · stable · fulcrum-acp-bridge",
      sub: "promoted by agent gpt-5.4 · deployed to 100%",
      release: [
        { k: "version", v: "0.4.2" },
        { k: "channel", v: "stable" },
        { k: "promoted at", v: "2026-05-17T10:51:00Z" },
        { k: "rollout", v: "100% (deployed)" },
        { k: "artifact sha", v: "sha256:55014…df1a" },
        { k: "build trace", v: "tr_55014df1aa90" },
      ],
      checks: [{ name: "unit (acp bridge)", ok: true, age: "passed · 0m 38s" }],
      includes: [{ summary: "fix(acp): reconnect on stream drop", ref: "#4198" }],
      timeline: [{ t: "10:51:00", text: "promoted from canary by agent gpt-5.4" }],
    },
    {
      id: "fulcrum-server@0.18.0-rc.4",
      artifact: "fulcrum-server 0.18.0-rc.4",
      channel: "canary",
      status: "cancelled",
      desc: "retired",
      inFlight: false,
      checksOk: 11,
      checksFail: 0,
      author: "mk",
      promoted: "09:14",
      trace: "tr_71f0a99c",
      size: "38.4 MB",
      crumbs: "ship · canary · fulcrum-server",
      sub: "cut by mk · retired after 0.18.0 promotion",
      release: [
        { k: "version", v: "0.18.0-rc.4" },
        { k: "channel", v: "canary" },
        { k: "promoted at", v: "2026-05-17T09:14:00Z" },
        { k: "rollout", v: "retired" },
        { k: "artifact sha", v: "sha256:71f0a…99cb" },
        { k: "build trace", v: "tr_71f0a99cbe22" },
      ],
      checks: [{ name: "unit (auth, limit, obs)", ok: true, age: "passed · 1m 19s" }],
      includes: [{ summary: "feat(auth): rotate session token per device", ref: "#4218" }],
      timeline: [{ t: "09:14:00", text: "cut from main by mk" }],
    },
    {
      id: "fulcrum-server@0.18.0-rc.3",
      artifact: "fulcrum-server 0.18.0-rc.3",
      channel: "canary",
      status: "failing",
      desc: "rolled back",
      inFlight: false,
      checksOk: 8,
      checksFail: 3,
      author: "agent opus-4.7",
      promoted: "Tue 22:18",
      trace: "tr_31f200ab",
      size: "38.3 MB",
      crumbs: "ship · canary · fulcrum-server",
      sub: "cut by agent opus-4.7 · rolled back after canary SLO regression",
      release: [
        { k: "version", v: "0.18.0-rc.3" },
        { k: "channel", v: "canary" },
        { k: "promoted at", v: "2026-05-15T22:18:00Z" },
        { k: "rollout", v: "rolled back at 5%" },
        { k: "artifact sha", v: "sha256:31f20…0ab7" },
        { k: "build trace", v: "tr_31f200ab4419" },
      ],
      checks: [
        { name: "unit (auth, limit, obs)", ok: true, age: "passed · 1m 30s" },
        { name: "canary 1% · 30 min", ok: false, age: "failed · p99 +180 ms" },
      ],
      includes: [{ summary: "feat(limit): per-kid rate buckets", ref: "#4221" }],
      timeline: [
        { t: "Tue 22:18", text: "cut from main by agent opus-4.7" },
        { t: "Tue 22:51", text: "rolled back · canary SLO regression" },
      ],
    },
    {
      id: "fulcrum-server@0.17.4",
      artifact: "fulcrum-server 0.17.4",
      channel: "stable",
      status: "completed",
      desc: "deployed",
      inFlight: false,
      checksOk: 13,
      checksFail: 0,
      author: "mk",
      promoted: "Mon 14:02",
      trace: "tr_22f9a01c",
      size: "38.2 MB",
      crumbs: "ship · stable · fulcrum-server",
      sub: "promoted by mk · deployed to 100%",
      release: [
        { k: "version", v: "0.17.4" },
        { k: "channel", v: "stable" },
        { k: "promoted at", v: "2026-05-14T14:02:00Z" },
        { k: "rollout", v: "100% (deployed)" },
        { k: "artifact sha", v: "sha256:22f9a…01cd" },
        { k: "build trace", v: "tr_22f9a01cef33" },
      ],
      checks: [{ name: "unit (auth, limit, obs)", ok: true, age: "passed · 1m 22s" }],
      includes: [{ summary: "fix(obs): backfill trace-id on background jobs", ref: "#4209" }],
      timeline: [{ t: "Mon 14:02", text: "promoted from canary by mk" }],
    },
    {
      id: "fulcrum-server@0.17.3",
      artifact: "fulcrum-server 0.17.3",
      channel: "stable",
      status: "completed",
      desc: "deployed",
      inFlight: false,
      checksOk: 12,
      checksFail: 0,
      author: "mk",
      promoted: "Sun 11:30",
      trace: "tr_010baad3",
      size: "38.1 MB",
      crumbs: "ship · stable · fulcrum-server",
      sub: "promoted by mk · deployed to 100%",
      release: [
        { k: "version", v: "0.17.3" },
        { k: "channel", v: "stable" },
        { k: "promoted at", v: "2026-05-13T11:30:00Z" },
        { k: "rollout", v: "100% (deployed)" },
        { k: "artifact sha", v: "sha256:010ba…ad3e" },
        { k: "build trace", v: "tr_010baad3ff44" },
      ],
      checks: [{ name: "unit (auth, limit, obs)", ok: true, age: "passed · 1m 18s" }],
      includes: [{ summary: "chore(deps): bump prisma 5.6 → 5.7", ref: "#4214" }],
      timeline: [{ t: "Sun 11:30", text: "promoted from canary by mk" }],
    },
  ];

  /** Toolbar release-table columns, OD `ship.html` order. */
  const COLUMNS = [
    "Artifact",
    "Channel",
    "Status",
    "Checks",
    "Author",
    "Promoted",
    "Trace",
    "Size",
    "Modes",
  ] as const;

  // --- live UI state -------------------------------------------------------

  /** `?state=empty` renders the COPY.md §129 Ship empty state. */
  const emptyState = $derived(page.url.searchParams.get("state") === "empty");

  /** The release whose peek-overview panel is open; `null` = panel closed. */
  let peekId = $state<string | null>(null);
  /** The release row carrying `aria-current` (focused release). */
  let focusedId = $state(releases[0]?.id ?? "");
  /** Per-row ModeRow selection (DESIGN.md §356 four-mode affordance). */
  let rowModes = $state<Record<string, WorkflowMode>>(
    Object.fromEntries(releases.map((r) => [r.id, "manual" as WorkflowMode])),
  );

  /**
   * Confirmation-tier state. COPY.md §4 destructive-without-text-confirm: the
   * action button reveals an inline confirm in the same spot — no modal,
   * `Esc` cancels. `pendingConfirm` holds the action awaiting its inline
   * confirm; `confirmedAction` holds the last completed action so design-e2e
   * can assert the tier resolved.
   */
  let pendingConfirm = $state<null | "cut-release" | "roll-back" | "pause-rollout" | "promote">(
    null,
  );
  let confirmedAction = $state<string | null>(null);

  const peekRelease = $derived(releases.find((r) => r.id === peekId) ?? null);

  function openPeek(id: string): void {
    peekId = id;
    focusedId = id;
  }

  function closePeek(): void {
    peekId = null;
    pendingConfirm = null;
  }

  /** Stage 1 of a COPY.md §4 confirmation tier — reveal the inline confirm. */
  function requestConfirm(action: typeof pendingConfirm): void {
    pendingConfirm = action;
  }

  /** Stage 2 — the operator confirms; the action resolves. */
  function resolveConfirm(): void {
    confirmedAction = pendingConfirm;
    pendingConfirm = null;
  }

  /** `Esc` cancels any pending inline confirm (COPY.md §4). */
  function cancelConfirm(): void {
    pendingConfirm = null;
  }

  function onRowKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPeek(id);
    }
  }

  /** `Mod+R` cuts a release — opens the inline confirm tier (OD `⌘R` kbd). */
  function onWindowKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
      event.preventDefault();
      requestConfirm("cut-release");
      return;
    }
    if (event.key === "Escape") {
      if (pendingConfirm) cancelConfirm();
      else if (peekId) closePeek();
    }
  }
</script>

<svelte:head><title>Ship · artifacts | Fulcrum</title></svelte:head>
<svelte:window onkeydown={onWindowKeydown} />

<div data-route="ws-stage" data-stage="ship" class="grid h-full min-h-0 grid-rows-[auto_1fr]">
  <!-- TOOLBAR — OD `.toolbar` -->
  <div
    data-ship-toolbar
    class={cn(
      "grid items-center gap-3 border-b border-border bg-card px-5 py-3.5",
      "grid-cols-1 lg:grid-cols-[1fr_auto]",
    )}
  >
    <div class="flex min-w-0 items-center gap-3.5">
      <h1 class="text-lg font-semibold tracking-[-0.01em]">Artifacts</h1>
      <span data-ship-subline class="font-mono text-xs text-muted-foreground">
        7 releases · 1 in flight · channel stable
      </span>
    </div>
    <div class="flex flex-wrap items-center gap-2.5 lg:justify-self-end">
      <!-- segmented Channel / Sort / Filter group — OD `.group` -->
      <div
        data-ship-filter-group
        class="inline-flex overflow-hidden rounded-md border border-border bg-background"
      >
        <button
          type="button"
          data-ship-channel-filter
          class={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          )}
        >
          <span aria-hidden="true">▤</span>
          Channel
          <span class="font-semibold text-foreground">stable</span>
          <span aria-hidden="true">▾</span>
        </button>
        <button
          type="button"
          data-ship-sort
          class={cn(
            "inline-flex items-center gap-1.5 border-l border-border px-3 py-1.5 text-xs font-medium",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          )}
        >
          <span aria-hidden="true">↓</span>
          Newest
          <span aria-hidden="true">▾</span>
        </button>
        <button
          type="button"
          data-ship-filter
          class={cn(
            "inline-flex items-center gap-1.5 border-l border-border px-3 py-1.5 text-xs font-medium",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          )}
        >
          <span aria-hidden="true">⫶</span>
          Filter
        </button>
      </div>
      <!-- `Cut release` primary — OD `.cut-release` gradient action + `⌘R` -->
      <Button
        data-ship-cut-release
        variant="default"
        size="sm"
        title="Cut a new release from current main"
        onclick={() => requestConfirm("cut-release")}
      >
        <span aria-hidden="true">🚀</span>
        Cut release
        <kbd
          data-ship-cut-release-kbd
          class={cn(
            "ml-1 rounded border border-primary-foreground/20 bg-black/25 px-1.5",
            "font-mono text-[10px] text-primary-foreground",
          )}
        >
          ⌘R
        </kbd>
      </Button>
    </div>
  </div>

  <!-- inline confirm tier for `Cut release` — COPY.md §4 destructive-without-text-confirm -->
  {#if pendingConfirm === "cut-release"}
    <div
      data-ship-confirm="cut-release"
      data-confirm-tier="destructive-inline"
      role="alert"
      class={cn(
        "flex flex-wrap items-center gap-2 border-b border-border bg-warning/10 px-5 py-2 text-xs",
      )}
    >
      <span aria-hidden="true" class="text-warning">⚠</span>
      <span class="font-medium">Cut a release from <code class="font-mono">main</code>?</span>
      <span class="text-muted-foreground">This starts a canary rollout. Esc cancels.</span>
      <span class="flex-1"></span>
      <Button variant="ghost" size="sm" data-ship-confirm-cancel onclick={cancelConfirm}>
        Cancel
      </Button>
      <Button variant="default" size="sm" data-ship-confirm-yes onclick={resolveConfirm}>
        Confirm cut release
      </Button>
    </div>
  {/if}

  {#if emptyState}
    <!-- COPY.md §129 Ship empty state -->
    <div data-ship-empty class="flex items-center justify-center p-10">
      <EmptyState
        title="No artifacts yet."
        description="Artifacts are produced by runs in Build. Approved reviews send them here."
      >
        {#snippet actions()}
          <Button variant="outline" size="sm" href="/build-runs">Open Build</Button>
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <!-- RELEASE TABLE + PEEK — OD `.table-wrap` -->
    <div data-ship-table-wrap class="relative min-h-0 overflow-auto">
      <table data-ship-release-table class="w-full min-w-[1080px] border-collapse text-sm">
        <thead>
          <tr>
            <th
              class={cn(
                "sticky top-0 z-[2] w-6 border-b border-border bg-card px-2.5 py-1.5",
              )}
            ></th>
            {#each COLUMNS as col (col)}
              <th
                class={cn(
                  "sticky top-0 z-[2] border-b border-border bg-card px-2.5 py-1.5 text-left",
                  "text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                  col === "Size" && "text-right",
                )}
              >
                {col}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each releases as release (release.id)}
            <tr
              data-ship-release-row
              data-release-id={release.id}
              data-status={release.status}
              data-channel={release.channel}
              aria-current={release.id === focusedId ? "true" : undefined}
              role="button"
              tabindex="0"
              onclick={() => openPeek(release.id)}
              onkeydown={(event) => onRowKeydown(event, release.id)}
              class={cn(
                "cursor-pointer transition-colors hover:bg-muted/50",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                release.id === focusedId && "bg-accent/10",
              )}
            >
              <td class="border-b border-border px-2.5 py-1.5">
                {#if release.inFlight}
                  <span data-ship-ribbon aria-label="In flight" class="text-accent">▶</span>
                {/if}
              </td>
              <td class="border-b border-border px-2.5 py-1.5 font-medium text-foreground">
                {release.artifact}
              </td>
              <td data-ship-channel class="border-b border-border px-2.5 py-1.5">
                {release.channel}
              </td>
              <td class="whitespace-nowrap border-b border-border px-2.5 py-1.5">
                <span class="inline-flex items-center gap-1.5">
                  <StatusBadge status={release.status} />
                  <span data-ship-status-desc class="font-mono text-[10px] text-muted-foreground">
                    {release.desc}
                  </span>
                </span>
              </td>
              <td class="whitespace-nowrap border-b border-border px-2.5 py-1.5">
                <span data-ship-checks-ok class="font-mono text-[10px] text-success">
                  ✓ {release.checksOk}
                </span>
                {#if release.checksFail > 0}
                  <span aria-hidden="true" class="text-muted-foreground">·</span>
                  <span data-ship-checks-fail class="font-mono text-[10px] text-destructive">
                    ✕ {release.checksFail}
                  </span>
                {/if}
              </td>
              <td data-ship-author class="border-b border-border px-2.5 py-1.5">
                {release.author}
              </td>
              <td class="border-b border-border px-2.5 py-1.5 font-mono text-xs text-fg-subtle">
                {release.promoted}
              </td>
              <td class="border-b border-border px-2.5 py-1.5 font-mono text-xs text-fg-subtle">
                {release.trace}
              </td>
              <td
                class={cn(
                  "border-b border-border px-2.5 py-1.5 text-right font-mono text-xs text-fg-subtle",
                )}
              >
                {release.size}
              </td>
              <td class="border-b border-border px-2 py-1">
                <!-- click-stop so toggling a mode does not open the peek -->
                <span
                  role="presentation"
                  onclick={(event) => event.stopPropagation()}
                  onkeydown={(event) => event.stopPropagation()}
                >
                  <ModeRow density="compact" bind:value={rowModes[release.id]} />
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      <!-- PEEK OVERLAY — DESIGN.md §197 peek-overview, no route change -->
      {#if peekRelease}
        <div
          data-ship-peek-backdrop
          class="absolute inset-0 z-30 flex justify-end bg-black/40"
          role="presentation"
          onclick={closePeek}
        >
          <aside
            data-ship-peek
            role="dialog"
            aria-modal="true"
            aria-label={`Release ${peekRelease.artifact}`}
            class={cn(
              "flex h-full w-full flex-col overflow-y-auto border-l border-border-strong bg-card",
              "shadow-[-8px_0_32px_oklch(0_0_0/0.4)]",
              "lg:w-1/2 lg:min-w-[520px] lg:max-w-[880px]",
            )}
            onclick={(event) => event.stopPropagation()}
          >
            <!-- peek head — crumbs, title, status, trace pill, close -->
            <header
              data-ship-peek-head
              class={cn(
                "sticky top-0 z-[2] flex flex-col gap-3 border-b border-border bg-card px-6 py-4",
              )}
            >
              <!-- meta cluster: status + trace pill + close, wraps on narrow panels -->
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1.5">
                  <StatusBadge status={peekRelease.status} />
                  <span class="font-mono text-[10px] text-muted-foreground">
                    {peekRelease.desc}
                  </span>
                </span>
                <TraceChip traceId={`${peekRelease.trace}cc`} badge project="fulcrum" />
                <span class="flex-1"></span>
                <button
                  type="button"
                  data-ship-peek-close
                  aria-label="Close release panel"
                  onclick={closePeek}
                  class={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm",
                    "text-muted-foreground hover:bg-muted hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  )}
                >
                  ✕
                </button>
              </div>
              <!-- title block: crumbs, release title, provenance sub-line -->
              <div class="min-w-0">
                <span
                  class={cn(
                    "block font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground",
                  )}
                >
                  {peekRelease.crumbs}
                </span>
                <h2 class="mt-1.5 text-xl font-semibold tracking-[-0.01em]">
                  {peekRelease.artifact}
                </h2>
                <span class="mt-1 block text-xs text-fg-subtle">{peekRelease.sub}</span>
              </div>
            </header>

            <div class="flex flex-1 flex-col gap-[18px] p-6 text-sm">
              <!-- Release section -->
              <section
                data-ship-peek-section="release"
                class="rounded-md border border-border bg-background p-5"
              >
                <h3
                  class={cn(
                    "mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase",
                    "tracking-[0.06em] text-muted-foreground",
                  )}
                >
                  <span aria-hidden="true" class="h-3 w-[3px] rounded-sm bg-accent"></span>
                  Release
                </h3>
                {#each peekRelease.release as kv (kv.k)}
                  <div
                    class={cn(
                      "grid grid-cols-[140px_1fr] gap-2 border-b border-dashed border-border py-1.5",
                      "last:border-b-0",
                    )}
                  >
                    <span class="text-xs text-fg-subtle">{kv.k}</span>
                    <span class="font-mono text-xs text-foreground">{kv.v}</span>
                  </div>
                {/each}
              </section>

              <!-- Checks section -->
              <section
                data-ship-peek-section="checks"
                class="rounded-md border border-border bg-background p-5"
              >
                <h3
                  class={cn(
                    "mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase",
                    "tracking-[0.06em] text-muted-foreground",
                  )}
                >
                  <span aria-hidden="true" class="h-3 w-[3px] rounded-sm bg-accent"></span>
                  Checks
                </h3>
                {#each peekRelease.checks as check (check.name)}
                  <div
                    data-ship-check
                    data-check-ok={check.ok}
                    class={cn(
                      "grid grid-cols-[18px_1fr_auto] items-center gap-2.5 border-b border-dashed",
                      "border-border py-1.5 last:border-b-0",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      class={check.ok ? "text-success" : "text-destructive"}
                    >
                      {check.ok ? "✓" : "✕"}
                    </span>
                    <span class="text-xs">{check.name}</span>
                    <span class="font-mono text-[10px] text-muted-foreground">{check.age}</span>
                  </div>
                {/each}
              </section>

              <!-- Includes section -->
              <section
                data-ship-peek-section="includes"
                class="rounded-md border border-border bg-background p-5"
              >
                <h3
                  class={cn(
                    "mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase",
                    "tracking-[0.06em] text-muted-foreground",
                  )}
                >
                  <span aria-hidden="true" class="h-3 w-[3px] rounded-sm bg-accent"></span>
                  Includes
                </h3>
                <div class="flex flex-col gap-1 text-xs leading-relaxed text-fg-subtle">
                  {#each peekRelease.includes as change (change.ref)}
                    <span>
                      {change.summary}
                      <span class="font-mono text-muted-foreground">{change.ref}</span>
                    </span>
                  {/each}
                </div>
              </section>

              <!-- Timeline section -->
              <section
                data-ship-peek-section="timeline"
                class="rounded-md border border-border bg-background p-5"
              >
                <h3
                  class={cn(
                    "mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase",
                    "tracking-[0.06em] text-muted-foreground",
                  )}
                >
                  <span aria-hidden="true" class="h-3 w-[3px] rounded-sm bg-accent"></span>
                  Timeline
                </h3>
                <div class="flex flex-col gap-1.5 text-xs">
                  {#each peekRelease.timeline as event, i (i)}
                    <div class="grid grid-cols-[80px_1fr] gap-2 text-fg-subtle">
                      <span class="font-mono text-muted-foreground">{event.t}</span>
                      <span>{event.text}</span>
                    </div>
                  {/each}
                </div>
              </section>
            </div>

            <!-- peek action bar — Roll back / Pause rollout / Open run feed / Promote -->
            <footer
              data-ship-peek-foot
              class={cn(
                "sticky bottom-0 z-[2] flex flex-wrap items-center gap-2 border-t border-border",
                "bg-card px-6 py-3.5",
              )}
            >
              {#if pendingConfirm === "roll-back"}
                <!-- COPY.md §4 destructive tier — inline confirm, Esc cancels -->
                <span
                  data-ship-confirm="roll-back"
                  data-confirm-tier="destructive-inline"
                  role="alert"
                  class="flex flex-wrap items-center gap-2 text-xs"
                >
                  <span aria-hidden="true" class="text-destructive">⚠</span>
                  <span class="font-medium">Roll back this rollout?</span>
                  <Button variant="ghost" size="sm" data-ship-confirm-cancel onclick={cancelConfirm}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    data-ship-confirm-yes
                    onclick={resolveConfirm}
                  >
                    Confirm roll back
                  </Button>
                </span>
              {:else if pendingConfirm === "pause-rollout"}
                <span
                  data-ship-confirm="pause-rollout"
                  data-confirm-tier="destructive-inline"
                  role="alert"
                  class="flex flex-wrap items-center gap-2 text-xs"
                >
                  <span aria-hidden="true" class="text-warning">⚠</span>
                  <span class="font-medium">Pause this rollout?</span>
                  <Button variant="ghost" size="sm" data-ship-confirm-cancel onclick={cancelConfirm}>
                    Cancel
                  </Button>
                  <Button variant="default" size="sm" data-ship-confirm-yes onclick={resolveConfirm}>
                    Confirm pause
                  </Button>
                </span>
              {:else if pendingConfirm === "promote"}
                <span
                  data-ship-confirm="promote"
                  data-confirm-tier="destructive-inline"
                  role="alert"
                  class="flex flex-wrap items-center gap-2 text-xs"
                >
                  <span aria-hidden="true" class="text-warning">⚠</span>
                  <span class="font-medium">Promote to 100% of clients?</span>
                  <Button variant="ghost" size="sm" data-ship-confirm-cancel onclick={cancelConfirm}>
                    Cancel
                  </Button>
                  <Button variant="default" size="sm" data-ship-confirm-yes onclick={resolveConfirm}>
                    Confirm promote
                  </Button>
                </span>
              {:else}
                <Button
                  variant="destructive"
                  size="sm"
                  data-ship-action="roll-back"
                  onclick={() => requestConfirm("roll-back")}
                >
                  ⏪ Roll back
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  data-ship-action="pause-rollout"
                  onclick={() => requestConfirm("pause-rollout")}
                >
                  ⏸ Pause rollout
                </Button>
                <span class="flex-1"></span>
                <Button variant="ghost" size="sm" data-ship-action="open-run-feed" href="/build-runs">
                  Open run feed
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  data-ship-action="promote"
                  onclick={() => requestConfirm("promote")}
                >
                  ▶ Promote to 100%
                </Button>
              {/if}
            </footer>
          </aside>
        </div>
      {/if}
    </div>
  {/if}

  <!-- design-e2e probe: the last resolved confirmation-tier action -->
  {#if confirmedAction}
    <span data-ship-confirmed={confirmedAction} class="sr-only">
      {confirmedAction} confirmed
    </span>
  {/if}
</div>

<script lang="ts">
  /**
   * Operate · Alerts — OD `operate-alerts.html` fidelity surface.
   *
   * Canonical route: `/<ws>/projects/<projId>/operate/alerts` (IA-MAP.md §2.6
   * screen table `Operate | :alerts | firing alerts | severity tabs`). The live
   * `operate-alerts` route folder is the migration alias — `route-map.ts`
   * `LEGACY_ROUTE_MAP` maps `operate-alerts → operate`, so the old
   * `/operate-alerts` path keeps resolving (no 404) while presenting as the
   * Operate stage.
   *
   * This route was **mislabeled** before the recovery: it rendered a
   * login-sessions revocation table (`<title>Operate · Sessions</title>`,
   * `<h1>Login sessions</h1>`, `data-operate-alerts-*` hooks). The
   * mislabeled-route content migration (`prd-cross-mislabeled-route-content-
   * migration`) preserved that login-sessions content verbatim at
   * `_migrated-content/+page.svelte.preserved` so the Auth/account-security
   * cluster PRD (`prd-web-system-account-security`) can re-home it into the
   * Settings active-sessions panel with its `data-operate-alerts-*` hooks
   * renamed to `data-account-sessions-*` — no feature loss. This route is now
   * rebuilt fresh as the OD Alerts console; the `operate-alerts` route NAME
   * belongs to the OD Alerts surface.
   *
   * Severity is grouped into the OD `tabs` strip (Firing / Awaiting ack /
   * Resolved / Silenced); selecting a tab regroups the alert list. Each alert
   * row carries the universal compact `ModeRow` (DESIGN.md §4.11 / §4.13 —
   * "every step header … subsystem row" — an alert row is a Step). Status
   * badges use the canonical 8-state vocabulary via the ui-kit `StatusBadge`
   * (DESIGN.md §4.9 — color + glyph + text, never color alone): the OD badge
   * labels `failing` / `waiting-input` / `completed` map directly. The empty
   * state uses the locked `COPY.md` operate-alerts strings (the divergent OD
   * hidden `empty-state` copy is intentionally NOT used — COPY.md is canonical).
   */
  import { page } from "$app/stores";
  import {
    EmptyState,
    ErrorBanner,
    ModeRow,
    StatusBadge,
    type WorkflowMode,
    type WorkflowStatus,
  } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  /** OD `sev-dot` severity classes — `crit` / `warn` / `info`. */
  type AlertSeverity = "crit" | "warn" | "info";

  /**
   * The four OD severity tabs. `firing` and `awaiting-ack` are the two live
   * lanes; `resolved` and `silenced` are the closed lanes. An alert belongs to
   * exactly one lane — the lane is the lifecycle bucket the OD tab strip groups
   * by.
   */
  type AlertLane = "firing" | "awaiting-ack" | "resolved" | "silenced";

  interface AlertLaneTab {
    id: AlertLane;
    label: string;
  }

  /** OD severity-tab strip, left-to-right, verbatim. */
  const ALERT_LANES: readonly AlertLaneTab[] = [
    { id: "firing", label: "Firing" },
    { id: "awaiting-ack", label: "Awaiting ack" },
    { id: "resolved", label: "Resolved" },
    { id: "silenced", label: "Silenced" },
  ] as const;

  interface ThresholdAlert {
    /** Stable id — also the design-e2e row hook value. */
    id: string;
    /** OD pulsing `sev-dot` severity. */
    severity: AlertSeverity;
    /** Severity-tab lane this alert is grouped under. */
    lane: AlertLane;
    /** OD `.title` — the human alert name. */
    title: string;
    /** OD `.desc` — mono threshold-breach detail line carrying the `rule_id`. */
    description: string;
    /** Threshold-breach rule id (`alr_*`) — surfaced in the desc line. */
    ruleId: string;
    /**
     * Canonical 8-state status the OD `badge` maps onto. OD badge labels
     * `failing` / `waiting-input` / `completed` are exactly canonical states.
     */
    status: WorkflowStatus;
    /** Trace id for the firing — OD `meta` column. Closed alerts may omit it. */
    traceId?: string;
    /** Relative-time string — OD `meta` column (`3m ago`, `yesterday`). */
    age: string;
    /**
     * OD lifecycle-state `meta` column (`ongoing` / `ack pending` /
     * `auto-resolved` / `resolved by mkh`).
     */
    lifecycle: string;
    /** Per-row mode-row selection (DESIGN.md §4.11). */
    mode?: WorkflowMode;
  }

  /**
   * The threshold-breach alerts the OD `operate-alerts.html` rows model. These
   * are design-fixture rows for the rendered OD-fidelity surface — the
   * threshold-breach rule evaluator that produces live `alr_*`-tagged firings
   * is the CLI/TUI vertical-slice's concern, out of this web route's scope.
   */
  const ALERT_FIXTURE: readonly ThresholdAlert[] = [
    {
      id: "alr_a8c92",
      severity: "crit",
      lane: "firing",
      title: "MCP server context-mode latency > 5s",
      description: "p99 6.4s for last 5m · threshold 5s · rule_id alr_a8c92",
      ruleId: "alr_a8c92",
      status: "failing",
      traceId: "tr_b41c92e",
      age: "3m ago",
      lifecycle: "ongoing",
    },
    {
      id: "alr_2d31f",
      severity: "crit",
      lane: "firing",
      title: "Agent run failure rate spike (mobile surface)",
      description: "10% in last 15m (baseline 0.4%) · rule_id alr_2d31f",
      ruleId: "alr_2d31f",
      status: "failing",
      traceId: "tr_e91c2a3",
      age: "12m ago",
      lifecycle: "ongoing",
    },
    {
      id: "alr_71e09",
      severity: "warn",
      lane: "awaiting-ack",
      title: "Disk usage on data partition > 70%",
      description: "72.4% of 50 GB · expected within 5 days · rule_id alr_71e09",
      ruleId: "alr_71e09",
      status: "waiting-input",
      age: "42m ago",
      lifecycle: "ack pending",
    },
    {
      id: "alr_3082c",
      severity: "info",
      lane: "resolved",
      title: "Doctor: filesystem watcher recovered",
      description: "Was failing 18m, now passing · rule_id alr_3082c",
      ruleId: "alr_3082c",
      status: "completed",
      traceId: "tr_7e22f4d",
      age: "1h ago",
      lifecycle: "auto-resolved",
    },
    {
      id: "alr_b1d04",
      severity: "info",
      lane: "resolved",
      title: "Cold-boot time exceeded 5s target",
      description: "5.7s yesterday · target 5s · rule_id alr_b1d04",
      ruleId: "alr_b1d04",
      status: "completed",
      traceId: "tr_b1d04ea",
      age: "yesterday",
      lifecycle: "resolved by mkh",
    },
  ];

  /**
   * `?state=empty` forces the quiet zero-alerts state; `?state=error` forces
   * the alert-evaluator failure banner. Both data states are declared in the
   * PRD `states` array so design-e2e proves them without a live rule engine.
   */
  const stateParam = $derived($page.url.searchParams.get("state"));
  const emptyState = $derived(stateParam === "empty");
  const errorState = $derived(stateParam === "error");

  let alerts = $state<ThresholdAlert[]>(structuredClone([...ALERT_FIXTURE]));
  let activeLane = $state<AlertLane>("firing");

  /** Alerts visible right now — empty when the empty data state is forced. */
  const liveAlerts = $derived(emptyState ? [] : alerts);

  /** Per-lane alert count — drives the OD tab count pills + the head count line. */
  const laneCounts = $derived(
    Object.fromEntries(
      ALERT_LANES.map((lane) => [
        lane.id,
        liveAlerts.filter((alert) => alert.lane === lane.id).length,
      ]),
    ) as Record<AlertLane, number>,
  );

  /** The alert rows for the selected severity tab — OD list regroups on tab change. */
  const visibleAlerts = $derived(
    liveAlerts.filter((alert) => alert.lane === activeLane),
  );

  /** OD head count line — `2 firing · 1 awaiting ack · 7 resolved today`. */
  const headCount = $derived(
    `${laneCounts.firing} firing · ${laneCounts["awaiting-ack"]} awaiting ack · ${laneCounts.resolved} resolved today`,
  );

  /** OD badge label — the OD file labels its badges with canonical state words. */
  function statusLabel(status: WorkflowStatus): string {
    if (status === "failing") return "failing";
    if (status === "waiting-input") return "waiting-input";
    if (status === "completed") return "completed";
    return status;
  }

  /** Resolved + silenced lanes are closed — OD dims those rows to `opacity: 0.6`. */
  function isClosed(lane: AlertLane): boolean {
    return lane === "resolved" || lane === "silenced";
  }

  function selectLane(lane: AlertLane): void {
    activeLane = lane;
  }

  function setMode(id: string, mode: WorkflowMode): void {
    alerts = alerts.map((alert) =>
      alert.id === id ? { ...alert, mode } : alert,
    );
  }

  /**
   * Acknowledge a firing alert — moves it from `firing` to `awaiting-ack`
   * resolved into the `waiting-input` canonical state. Mirrors the OD
   * `ack pending` lifecycle transition.
   */
  function acknowledgeAlert(id: string): void {
    alerts = alerts.map((alert) =>
      alert.id === id
        ? {
            ...alert,
            lane: "awaiting-ack" as const,
            status: "waiting-input" as const,
            lifecycle: "ack pending",
          }
        : alert,
    );
    if (visibleAlerts.length === 0) activeLane = "awaiting-ack";
  }

  /**
   * Resolve an alert — moves it to the `resolved` lane in the `completed`
   * canonical state. Mirrors the OD `resolved by mkh` lifecycle transition.
   */
  function resolveAlert(id: string): void {
    alerts = alerts.map((alert) =>
      alert.id === id
        ? {
            ...alert,
            lane: "resolved" as const,
            status: "completed" as const,
            lifecycle: "resolved by mkh",
          }
        : alert,
    );
    if (visibleAlerts.length === 0) activeLane = "resolved";
  }
</script>

<svelte:head>
  <title>Operate · Alerts | Fulcrum</title>
</svelte:head>

<section
  data-operate-alerts
  data-state={errorState ? "error" : emptyState ? "empty" : "populated"}
  class="mx-auto flex w-full max-w-[1180px] flex-col gap-1 px-6 py-[18px] pb-20"
>
  <header data-alerts-head class="flex flex-wrap items-baseline gap-3.5">
    <h1
      data-operate-alerts-header
      class="text-[22px] font-semibold tracking-[-0.01em]"
    >
      Alerts
    </h1>
    <span data-alerts-count class="font-mono text-xs text-muted-foreground">
      {headCount}
    </span>
    <div class="ml-auto inline-flex gap-2">
      <button
        type="button"
        data-alerts-notification-rules
        class={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
      >Notification rules</button>
      <button
        type="button"
        data-alerts-new-rule
        class={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground",
          "hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
      >New rule</button>
    </div>
  </header>

  {#if errorState}
    <ErrorBanner
      data-alerts-error
      surface="block"
      title="Alert rule evaluation failed"
      message="The threshold-breach evaluator could not complete its last pass. Re-probe to refresh, or open telemetry for trends."
      traceId="tr_b41c92e7d3a08f64"
      retryLabel="Re-probe"
      class="mt-3"
    />
  {/if}

  <!-- OD severity tab strip — selecting a tab regroups the alert list. -->
  <div
    data-alerts-tabs
    role="tablist"
    aria-label="Alert severity"
    class="mt-4 flex gap-0 border-b border-border"
  >
    {#each ALERT_LANES as lane (lane.id)}
      {@const active = lane.id === activeLane}
      {@const count = laneCounts[lane.id]}
      <button
        type="button"
        role="tab"
        id="alerts-tab-{lane.id}"
        aria-selected={active}
        aria-controls="alerts-panel"
        data-alerts-tab={lane.id}
        data-active={active ? "true" : undefined}
        class={cn(
          "inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-xs transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          active
            ? "border-primary font-semibold text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
        onclick={() => selectLane(lane.id)}
      >
        {lane.label}
        <span
          data-alerts-tab-count={lane.id}
          class={cn(
            "inline-block rounded-full px-1.5 py-[1px] font-mono text-[10px]",
            lane.id === "firing" && count > 0
              ? "bg-destructive/15 text-destructive"
              : "bg-muted text-muted-foreground",
          )}
        >{count}</span>
      </button>
    {/each}
  </div>

  <div
    id="alerts-panel"
    role="tabpanel"
    aria-labelledby="alerts-tab-{activeLane}"
    data-alerts-panel={activeLane}
  >
    {#if emptyState}
      <!-- COPY.md operate-alerts empty state — the locked strings. The quiet
           zero-alerts state is a healthy steady state, not an absence. -->
      <div data-alerts-empty class="mt-3">
        <EmptyState
          title="No alerts firing."
          description="Doctor is quiet. Re-probe to refresh, or open telemetry for trends."
          tone="steady"
        >
          {#snippet actions()}
            <button
              type="button"
              data-alerts-empty-action="re-probe"
              class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/80"
            >Re-probe</button>
            <button
              type="button"
              data-alerts-empty-action="open-telemetry"
              class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs hover:bg-muted"
            >Open telemetry</button>
          {/snippet}
        </EmptyState>
      </div>
    {:else if visibleAlerts.length === 0}
      <!-- A populated console with an empty severity lane — the lane has no
           rows but the surface is not the global quiet state. -->
      <p data-alerts-lane-empty class="mt-6 text-xs text-muted-foreground">
        No alerts in this lane.
      </p>
    {:else}
      <div data-alerts-rows class="mt-1 flex flex-col">
        {#each visibleAlerts as alert (alert.id)}
          {@const closed = isClosed(alert.lane)}
          <article
            data-alert-row={alert.id}
            data-severity={alert.severity}
            data-status={alert.status}
            data-lane={alert.lane}
            data-closed={closed ? "true" : undefined}
            class={cn(
              "grid items-center gap-3.5 border-b border-border/60 px-4 py-3.5 last:border-0",
              "grid-cols-[16px_1fr_auto] sm:grid-cols-[16px_1fr_120px_140px_auto]",
              "hover:bg-muted/40",
              closed && "opacity-60",
            )}
          >
            <span
              data-alert-sev-dot={alert.severity}
              aria-hidden="true"
              class={cn(
                "size-2 rounded-full",
                alert.severity === "crit" && "bg-destructive alert-sev-pulse",
                alert.severity === "warn" && "bg-warning",
                alert.severity === "info" && "bg-primary",
              )}
            ></span>

            <div class="min-w-0">
              <div data-alert-title class="truncate text-[13px] font-medium">
                {alert.title}
              </div>
              <div
                data-alert-desc
                class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
              >
                {alert.description}
              </div>
            </div>

            <div class="hidden sm:block">
              <StatusBadge
                data-alert-status={alert.id}
                status={alert.status}
                hideLabel
              />
              <span data-alert-status-label={alert.id} class="ml-1.5 text-[11px] text-muted-foreground">
                {statusLabel(alert.status)}
              </span>
            </div>

            <div
              data-alert-meta={alert.id}
              class="hidden font-mono text-[11px] text-muted-foreground sm:block"
            >
              {#if alert.traceId}
                <a
                  data-alert-trace={alert.id}
                  href="#trace={alert.traceId}"
                  class="text-primary no-underline hover:underline"
                >{alert.traceId}</a>
                <br />
              {/if}
              <span data-alert-age={alert.id}>{alert.age}</span>
              <span data-alert-lifecycle={alert.id} class="block text-muted-foreground">
                {alert.lifecycle}
              </span>
            </div>

            <div class="flex items-center justify-end gap-1.5">
              {#if alert.lane === "firing"}
                <button
                  type="button"
                  data-alert-acknowledge={alert.id}
                  class="inline-flex h-6 items-center rounded border border-border bg-card px-2 text-[11px] text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  onclick={() => acknowledgeAlert(alert.id)}
                >Acknowledge</button>
              {/if}
              {#if alert.lane === "firing" || alert.lane === "awaiting-ack"}
                <button
                  type="button"
                  data-alert-resolve={alert.id}
                  class="inline-flex h-6 items-center rounded border border-border bg-card px-2 text-[11px] text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  onclick={() => resolveAlert(alert.id)}
                >Resolve</button>
              {/if}
              <ModeRow
                data-alert-mode-row={alert.id}
                density="compact"
                value={alert.mode ?? "manual"}
                onSelect={(mode) => setMode(alert.id, mode)}
              />
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  /*
   * OD `operate-alerts.html` pulsing `sev-dot.crit` — a 1.4s expanding-ring
   * pulse on critical alerts (the OD `@keyframes pulse`). Reduced-motion users
   * get the static dot per DESIGN.md §1.6.
   */
  .alert-sev-pulse {
    animation: alert-sev-pulse 1.4s ease-out infinite;
  }

  @keyframes alert-sev-pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in oklch, var(--destructive) 35%, transparent);
    }
    100% {
      box-shadow: 0 0 0 8px transparent;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .alert-sev-pulse {
      animation: none;
    }
  }
</style>

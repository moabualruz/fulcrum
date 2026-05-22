<script lang="ts">
  /**
   * Operate · Telemetry: OD `operate-telemetry.html` fidelity surface, with the
   * "Telemetry" name overload resolved (design-alignment/operate.md
   * §operate-telemetry.html "name conflict resolution required").
   *
   * The OD `operate-telemetry.html` file is a *workspace observability
   * dashboard*; the spec's "Telemetry" (`IA-MAP.md` §2.6 "Telemetry · Opt-in
   * 3-state (off/anon/on)", `COPY.md` §13, `DESIGN.md` §11 "No telemetry without
   * opt-in") is an *opt-in privacy setting*. They are two different things
   * sharing one name. This route resolves the overload by splitting the surface
   * into two disambiguated sub-views selected by the `?view=` query param:
   *
   *  - `?view=observability` (default): the OD metrics dashboard.
   *  - `?view=settings`: the COPY.md §13 opt-in 3-state privacy control.
   *
   * `/operate/telemetry` (IA-MAP.md §2.6) is the canonical telemetry-*settings*
   * address; the observability dashboard gets the distinct non-conflicting
   * `?view=observability` sub-route so "Telemetry" never overloads the privacy
   * control. A two-tab strip switches between them in-place (no full reload).
   *
   * The dashboard charts use the `layerchart` library (already an
   * `apps/web` dependency): a p50/p99 step-latency `LineChart` and a
   * runs-by-step `BarChart` on the canonical six-stage spine: never hand-rolled
   * SVG paths (AGENTS.md reuse-first / `goal.md` reuse-first rule, matching the
   * `DESIGN.md` §sources `04-observability-trace.md` Grafana/Honeycomb baseline).
   *
   * The dashboard header carries the universal per-Step `ModeRow` via the shared
   * `mode-affordance-host` (DESIGN.md §4.11/§4.13): the dashboard is a Step in
   * the Operate stage, its AI Assist mode routed through `operate.diagnose`
   * (the `fulcrum:open-ai-assist` shell event scoped to the diagnose Step).
   *
   * Composes `@fulcrum/ui-kit` primitives only: `Stat`, `RadioGroup` /
   * `RadioGroupItem`, `Button`, `Badge`, `ErrorBanner`, plus the `ModeRow` via
   * `mode-affordance-host`. No route-local charts, no new ui-kit primitives.
   *
   * States: `populated` (the OD reference scene) and `error` (the metrics-load
   * failure banner, forced with `?state=error`).
   */
  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import { BarChart, LineChart } from "layerchart";
  import { Badge, ErrorBanner, RadioGroup, RadioGroupItem, Stat } from "@fulcrum/ui-kit";
  import {
    ModeRow,
    createStepModeRow,
    modeAffordanceHooks,
    type ModeStepScope,
  } from "$lib/components/app/mode-affordance-host.ts";
  import { cn } from "@fulcrum/ui-kit";

  /* ----------------------------------------------------------------------- *
   * View disambiguation: resolves the "Telemetry" name overload.
   * ----------------------------------------------------------------------- */

  /** The two disambiguated sub-views this route hosts. */
  type TelemetryView = "observability" | "settings";

  /**
   * `?view=settings` shows the COPY.md §13 opt-in privacy control; anything
   * else (including no param) shows the OD observability dashboard.
   */
  const activeView = $derived<TelemetryView>(
    $page.url.searchParams.get("view") === "settings" ? "settings" : "observability",
  );

  /** Build the in-place tab href preserving the rest of the query string. */
  function viewHref(view: TelemetryView): string {
    const params = new URLSearchParams($page.url.search);
    if (view === "observability") params.delete("view");
    else params.set("view", view);
    const qs = params.toString();
    return qs ? `?${qs}` : $page.url.pathname;
  }

  /* ----------------------------------------------------------------------- *
   * Observability dashboard: OD `operate-telemetry.html`.
   * ----------------------------------------------------------------------- */

  /** The OD `range` selector windows (1h / 6h / 24h / 7d / 30d). */
  const RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
  type Range = (typeof RANGES)[number];

  /** Active range: OD defaults to `24h` (its `.range a.active`). */
  let range = $state<Range>("24h");

  /**
   * `?state=error` forces the metrics-load failure banner so design-e2e can
   * prove the OD failure copy without a live telemetry event store. The
   * `error` data state is declared in the PRD `states` array.
   */
  const errorState = $derived($page.url.searchParams.get("state") === "error");

  /** A latency sample point: one rolling bucket on the p50/p99 line chart. */
  interface LatencyPoint {
    /** Bucket label on the x-axis. */
    t: string;
    /** p50 step latency in seconds. */
    p50: number;
    /** p99 step latency in seconds. */
    p99: number;
  }

  /** Per-range telemetry roll-ups: re-bucketing the charts is a range switch. */
  interface RangeBundle {
    /** OD `.count` line: `last <range> · <n> events · <n> drops`. */
    events: string;
    drops: string;
    /** The 4-stat strip. */
    runs: { value: string; delta: string; trend: "up" | "down" | "flat" };
    p50: { value: string; delta: string; trend: "up" | "down" | "flat" };
    p99: { value: string; delta: string; trend: "up" | "down" | "flat" };
    errorRate: { value: string; delta: string; trend: "up" | "down" | "flat" };
    /** p50/p99 step-latency line-chart series. */
    latency: LatencyPoint[];
    /** Error-rate-by-surface rate table. */
    surfaces: { surface: string; runs: number; errors: number; rate: string }[];
    /** Runs-by-step bars on the canonical six-stage spine. */
    runsByStep: { step: string; runs: number }[];
    /** OD `.sub` line under the latency chart. */
    latencySub: string;
  }

  /**
   * The canonical six-stage spine: `capture → plan → build → review → ship →
   * operate` (DESIGN.md §2 / IA-MAP.md §2). The runs-by-step bars are keyed on
   * this exact order; the OD file abbreviates the labels (`cap`/`ops`).
   */
  const STAGE_SPINE = [
    { key: "capture", short: "cap" },
    { key: "plan", short: "plan" },
    { key: "build", short: "build" },
    { key: "review", short: "review" },
    { key: "ship", short: "ship" },
    { key: "operate", short: "ops" },
  ] as const;

  /** Build a rolling latency series for a range: n evenly-spaced buckets. */
  function latencySeries(
    buckets: number,
    p50Base: number,
    p99Base: number,
    label: (i: number, n: number) => string,
  ): LatencyPoint[] {
    return Array.from({ length: buckets }, (_, i) => {
      const drift = Math.sin((i / buckets) * Math.PI) * 0.4;
      return {
        t: label(i, buckets),
        p50: Number((p50Base + drift * 0.5 - i * 0.01).toFixed(2)),
        p99: Number((p99Base + drift * 4 - i * 0.05).toFixed(2)),
      };
    });
  }

  /**
   * Per-range telemetry data. The OD reference scene is the `24h` window
   * (`last 24h · 14k events · 0 drops`, 428 runs, p50 1.84s, p99 12.7s,
   * error 0.42%). Switching the range re-buckets every chart and stat -
   * proven by the design-e2e range-selector interaction assertion.
   */
  const RANGE_DATA: Record<Range, RangeBundle> = {
    "1h": {
      events: "612 events",
      drops: "0 drops",
      runs: { value: "21", delta: "+5.0% vs prev 1h", trend: "up" },
      p50: { value: "1.62s", delta: "−3.1% vs prev", trend: "up" },
      p99: { value: "9.4s", delta: "−12.0% vs prev", trend: "up" },
      errorRate: { value: "0.18%", delta: "−0.04 pts", trend: "up" },
      latency: latencySeries(12, 1.6, 9.0, (i) => `:${String(i * 5).padStart(2, "0")}`),
      latencySub: "Rolling 5-min buckets · 1h window",
      surfaces: [
        { surface: "web shell", runs: 15, errors: 0, rate: "0.00%" },
        { surface: "CLI", runs: 4, errors: 0, rate: "0.00%" },
        { surface: "TUI", runs: 2, errors: 0, rate: "0.00%" },
        { surface: "mobile", runs: 0, errors: 0, rate: "-" },
        { surface: "API", runs: 0, errors: 0, rate: "-" },
      ],
      runsByStep: [
        { step: "capture", runs: 4 },
        { step: "plan", runs: 6 },
        { step: "build", runs: 21 },
        { step: "review", runs: 14 },
        { step: "ship", runs: 5 },
        { step: "operate", runs: 3 },
      ],
    },
    "6h": {
      events: "3.5k events",
      drops: "0 drops",
      runs: { value: "118", delta: "+8.2% vs prev 6h", trend: "up" },
      p50: { value: "1.71s", delta: "−4.4% vs prev", trend: "up" },
      p99: { value: "10.9s", delta: "+6.0% vs prev", trend: "down" },
      errorRate: { value: "0.31%", delta: "−0.06 pts", trend: "up" },
      latency: latencySeries(18, 1.7, 10.5, (i) => `${i * 20}m`),
      latencySub: "Rolling 20-min buckets · 6h window",
      surfaces: [
        { surface: "web shell", runs: 86, errors: 0, rate: "0.00%" },
        { surface: "CLI", runs: 22, errors: 0, rate: "0.00%" },
        { surface: "TUI", runs: 6, errors: 0, rate: "0.00%" },
        { surface: "mobile", runs: 4, errors: 1, rate: "25.0%" },
        { surface: "API", runs: 0, errors: 0, rate: "-" },
      ],
      runsByStep: [
        { step: "capture", runs: 22 },
        { step: "plan", runs: 38 },
        { step: "build", runs: 118 },
        { step: "review", runs: 84 },
        { step: "ship", runs: 28 },
        { step: "operate", runs: 16 },
      ],
    },
    "24h": {
      events: "14k events",
      drops: "0 drops",
      runs: { value: "428", delta: "+12.4% vs prev 24h", trend: "up" },
      p50: { value: "1.84s", delta: "−6.2% vs prev", trend: "up" },
      p99: { value: "12.7s", delta: "+18.1% vs prev", trend: "down" },
      errorRate: { value: "0.42%", delta: "−0.08 pts", trend: "up" },
      latency: latencySeries(24, 1.8, 12.0, (i) => `${String(i).padStart(2, "0")}:00`),
      latencySub: "Rolling 5-min buckets · 24h window",
      surfaces: [
        { surface: "web shell", runs: 312, errors: 1, rate: "0.32%" },
        { surface: "CLI", runs: 84, errors: 0, rate: "0.00%" },
        { surface: "TUI", runs: 22, errors: 0, rate: "0.00%" },
        { surface: "mobile", runs: 10, errors: 1, rate: "10.0%" },
        { surface: "API", runs: 0, errors: 0, rate: "-" },
      ],
      runsByStep: [
        { step: "capture", runs: 162 },
        { step: "plan", runs: 266 },
        { step: "build", runs: 420 },
        { step: "review", runs: 300 },
        { step: "ship", runs: 172 },
        { step: "operate", runs: 120 },
      ],
    },
    "7d": {
      events: "98k events",
      drops: "2 drops",
      runs: { value: "2,914", delta: "+9.6% vs prev 7d", trend: "up" },
      p50: { value: "1.92s", delta: "+2.1% vs prev", trend: "down" },
      p99: { value: "13.4s", delta: "+4.5% vs prev", trend: "down" },
      errorRate: { value: "0.51%", delta: "+0.03 pts", trend: "down" },
      latency: latencySeries(14, 1.9, 13.0, (i) => `d${i + 1}`),
      latencySub: "Rolling 12-hour buckets · 7d window",
      surfaces: [
        { surface: "web shell", runs: 2104, errors: 9, rate: "0.43%" },
        { surface: "CLI", runs: 588, errors: 2, rate: "0.34%" },
        { surface: "TUI", runs: 156, errors: 1, rate: "0.64%" },
        { surface: "mobile", runs: 66, errors: 3, rate: "4.55%" },
        { surface: "API", runs: 0, errors: 0, rate: "-" },
      ],
      runsByStep: [
        { step: "capture", runs: 1080 },
        { step: "plan", runs: 1810 },
        { step: "build", runs: 2914 },
        { step: "review", runs: 2040 },
        { step: "ship", runs: 1180 },
        { step: "operate", runs: 820 },
      ],
    },
    "30d": {
      events: "412k events",
      drops: "11 drops",
      runs: { value: "12,640", delta: "+14.2% vs prev 30d", trend: "up" },
      p50: { value: "1.88s", delta: "−1.0% vs prev", trend: "up" },
      p99: { value: "12.9s", delta: "−3.8% vs prev", trend: "up" },
      errorRate: { value: "0.47%", delta: "−0.05 pts", trend: "up" },
      latency: latencySeries(30, 1.85, 12.5, (i) => `d${i + 1}`),
      latencySub: "Rolling daily buckets · 30d window",
      surfaces: [
        { surface: "web shell", runs: 9120, errors: 38, rate: "0.42%" },
        { surface: "CLI", runs: 2540, errors: 9, rate: "0.35%" },
        { surface: "TUI", runs: 680, errors: 4, rate: "0.59%" },
        { surface: "mobile", runs: 300, errors: 11, rate: "3.67%" },
        { surface: "API", runs: 0, errors: 0, rate: "-" },
      ],
      runsByStep: [
        { step: "capture", runs: 4600 },
        { step: "plan", runs: 7800 },
        { step: "build", runs: 12640 },
        { step: "review", runs: 8900 },
        { step: "ship", runs: 5100 },
        { step: "operate", runs: 3600 },
      ],
    },
  };

  /** The active range's roll-up: re-derived on every range switch. */
  const bundle = $derived(RANGE_DATA[range]);

  /** The OD `.count` line: `last <range> · <events> · <drops>`. */
  const countLine = $derived(`last ${range} · ${bundle.events} · ${bundle.drops}`);

  /** Runs-by-step bars folded onto the canonical six-stage spine order. */
  const runsByStepData = $derived(
    STAGE_SPINE.map((stage) => {
      const found = bundle.runsByStep.find((r) => r.step === stage.key);
      return { step: stage.key, short: stage.short, runs: found?.runs ?? 0 };
    }),
  );

  /** Latency line-chart series: p50 + p99, OKLCH-tokened via the chart vars. */
  const latencySeriesDef = [
    {
      key: "p50",
      label: "p50",
      value: (d: LatencyPoint) => d.p50,
      color: "hsl(var(--chart-1))",
    },
    {
      key: "p99",
      label: "p99",
      value: (d: LatencyPoint) => d.p99,
      color: "hsl(var(--chart-4))",
      props: { strokeDasharray: "5 3" },
    },
  ];

  /** Runs-by-step bar series. */
  const runsByStepSeries = [
    {
      key: "runs",
      label: "Runs",
      value: (d: { runs: number }) => d.runs,
      color: "hsl(var(--chart-1))",
    },
  ];

  /**
   * The dashboard is itself a Step in the Operate stage: it carries the
   * universal `ModeRow`. Its AI Assist mode routes through `operate.diagnose`:
   * the `diagnose` Step id ties an opened AI Assist drawer to the Operate
   * diagnose surface (design-alignment/operate.md "routed via operate.diagnose").
   */
  const dashboardModeScope: ModeStepScope = {
    stepId: "operate.diagnose",
    kind: "subsystem-row",
    title: "Telemetry · observability",
  };
  const dashboardModeRow = createStepModeRow(dashboardModeScope);

  function selectRange(next: Range): void {
    range = next;
  }

  /* ----------------------------------------------------------------------- *
   * Telemetry settings: COPY.md §13 opt-in 3-state privacy control.
   * ----------------------------------------------------------------------- */

  /** The COPY.md §13 opt-in modes: `On` / `Anonymous only` / `Off`. */
  type TelemetryMode = "on" | "anon" | "off";

  /**
   * The opt-in mode. DESIGN.md §11 "No telemetry without opt-in": the default
   * is `off`; nothing leaves the machine until the operator explicitly opts in.
   */
  let telemetryMode = $state<TelemetryMode>("off");

  /** Whether the first-run opt-in prompt is still showing (DESIGN.md §11). */
  let firstRunPending = $state(true);

  /** An audit-trail entry: every opt-in change is recorded (DESIGN.md §11). */
  interface AuditEntry {
    at: string;
    from: TelemetryMode;
    to: TelemetryMode;
  }

  /** The opt-in change audit trail: newest first. */
  let auditTrail = $state<AuditEntry[]>([]);

  /**
   * `DO_NOT_TRACK=1` in the environment hard-overrides the control to `off`
   * (COPY.md §13 "DO_NOT_TRACK=1 is respected"): the radios are then disabled
   * and the surface explains why. `?dnt=1` forces the scenario for design-e2e.
   */
  const doNotTrack = $derived($page.url.searchParams.get("dnt") === "1");

  /** The effective mode: `DO_NOT_TRACK` clamps it to `off` regardless. */
  const effectiveMode = $derived<TelemetryMode>(doNotTrack ? "off" : telemetryMode);

  /** Persist a mode change + record it in the audit trail. */
  function setTelemetryMode(next: string): void {
    const mode = next as TelemetryMode;
    if (doNotTrack || mode === telemetryMode) return;
    auditTrail = [
      { at: new Date().toISOString(), from: telemetryMode, to: mode },
      ...auditTrail,
    ];
    telemetryMode = mode;
  }

  /** Dismiss the first-run prompt: `Continue` (COPY.md §13). */
  function continueFirstRun(): void {
    firstRunPending = false;
  }

  /** The COPY.md §13 mode rows: copy is verbatim from the spec. */
  const TELEMETRY_OPTIONS: { value: TelemetryMode; label: string; description: string }[] = [
    {
      value: "on",
      label: "On",
      description: "Anonymous usage metrics + crash reports. Helps tune defaults.",
    },
    {
      value: "anon",
      label: "Anonymous only",
      description: "Crash reports without command-level events.",
    },
    {
      value: "off",
      label: "Off",
      description: "Default. No data leaves your machine.",
    },
  ];

  /** The `fulcrum config telemetry` CLI verb for a mode (COPY.md §13). */
  function configCommand(mode: TelemetryMode): string {
    return `fulcrum config telemetry ${mode}`;
  }
</script>

<svelte:head>
  <title>Operate · Telemetry | Fulcrum</title>
</svelte:head>

<section
  data-route="operate-telemetry"
  data-operate-telemetry
  data-view={activeView}
  data-state={errorState ? "error" : "populated"}
  class="mx-auto flex w-full max-w-[1400px] flex-col gap-3 px-6 py-[18px] pb-20"
>
  <!-- Two-tab disambiguation: resolves the "Telemetry" name overload. -->
  <nav
    data-telemetry-view-tabs
    role="tablist"
    aria-label="Telemetry surfaces"
    class="flex items-center gap-1 border-b border-border"
  >
    <a
      data-telemetry-view-tab="observability"
      role="tab"
      aria-selected={activeView === "observability"}
      aria-current={activeView === "observability" ? "page" : undefined}
      href={viewHref("observability")}
      class={cn(
        "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium no-underline transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        activeView === "observability"
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >Observability</a>
    <a
      data-telemetry-view-tab="settings"
      role="tab"
      aria-selected={activeView === "settings"}
      aria-current={activeView === "settings" ? "page" : undefined}
      href={viewHref("settings")}
      class={cn(
        "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium no-underline transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        activeView === "settings"
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >Telemetry settings</a>
  </nav>

  {#if activeView === "observability"}
    <!-- ================= OBSERVABILITY DASHBOARD: OD operate-telemetry.html ================ -->
    <header data-telemetry-head class="flex flex-wrap items-baseline gap-3.5">
      <h1 data-telemetry-title class="text-[22px] font-semibold tracking-tight">
        Telemetry
      </h1>
      <span data-telemetry-count class="font-mono text-xs text-muted-foreground">
        {countLine}
      </span>
      <nav
        data-telemetry-range
        role="radiogroup"
        aria-label="Telemetry time range"
        class="ml-auto inline-flex overflow-hidden rounded-md border border-border"
      >
        {#each RANGES as r (r)}
          {@const active = r === range}
          <button
            type="button"
            role="radio"
            aria-checked={active}
            data-telemetry-range-option={r}
            data-active={active ? "true" : undefined}
            class={cn(
              "border-r border-border px-2.5 py-[5px] font-mono text-[11px] last:border-r-0",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
              active
                ? "bg-primary font-semibold text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onclick={() => selectRange(r)}
          >{r}</button>
        {/each}
      </nav>
      <ModeRow
        data-telemetry-mode-row
        {...modeAffordanceHooks(dashboardModeScope)}
        density={dashboardModeRow.density}
        modes={dashboardModeRow.modes}
        ariaLabel={dashboardModeRow.ariaLabel}
        onSelect={dashboardModeRow.onSelect}
      />
    </header>

    {#if errorState}
      <ErrorBanner
        data-telemetry-error
        surface="block"
        title="Telemetry metrics could not load"
        message="The telemetry roll-up for this window could not be read. Retry to re-aggregate, or check the event store in Doctor."
        traceId="tr_9d34f1a0c7e25b88"
        retryLabel="Retry"
      />
    {/if}

    <!-- 4-stat strip: OD `.grid-stats`. -->
    <div data-telemetry-stats class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat
        data-telemetry-stat="agent-runs"
        label="Agent runs"
        value={bundle.runs.value}
        delta={bundle.runs.delta}
        trend={bundle.runs.trend}
      />
      <Stat
        data-telemetry-stat="p50-latency"
        label="p50 step latency"
        value={bundle.p50.value}
        delta={bundle.p50.delta}
        trend={bundle.p50.trend}
      />
      <Stat
        data-telemetry-stat="p99-latency"
        label="p99 step latency"
        value={bundle.p99.value}
        delta={bundle.p99.delta}
        trend={bundle.p99.trend}
      />
      <Stat
        data-telemetry-stat="error-rate"
        label="Error rate"
        value={bundle.errorRate.value}
        delta={bundle.errorRate.delta}
        trend={bundle.errorRate.trend}
      />
    </div>

    <!-- charts grid: OD `.charts` (2fr / 1fr). -->
    <div data-telemetry-charts class="grid grid-cols-1 gap-3.5 lg:grid-cols-[2fr_1fr]">
      <!-- p50/p99 step-latency line chart: OD `svg.line`, now a LayerChart LineChart. -->
      <article
        data-telemetry-chart="step-latency"
        class="rounded-lg border border-border bg-card p-4"
      >
        <h3 class="text-[13px] font-semibold">Step latency (p50 / p99)</h3>
        <p class="mb-3 text-[11px] text-muted-foreground">{bundle.latencySub}</p>
        <div data-telemetry-latency-chart style="height: 180px;">
          {#if browser}
            <LineChart
              data={bundle.latency}
              x={(d: LatencyPoint) => d.t}
              y={(d: LatencyPoint) => d.p99}
              series={latencySeriesDef}
              legend
              tooltip
              grid
              axis
            />
          {:else}
            <div
              class="size-full rounded-md bg-muted"
              style="height: 180px;"
              aria-hidden="true"
            ></div>
          {/if}
        </div>
      </article>

      <!-- Error-rate-by-surface rate table: OD `.rate-table`. -->
      <article
        data-telemetry-chart="error-rate-by-surface"
        class="rounded-lg border border-border bg-card p-4"
      >
        <h3 class="text-[13px] font-semibold">Agent error rate by surface</h3>
        <p class="mb-3 text-[11px] text-muted-foreground">Last {range}</p>
        <table data-telemetry-error-table class="w-full text-xs">
          <thead>
            <tr class="border-b border-border">
              <th class="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">Surface</th>
              <th class="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">Runs</th>
              <th class="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">Errors</th>
              <th class="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">Rate</th>
            </tr>
          </thead>
          <tbody>
            {#each bundle.surfaces as row (row.surface)}
              <tr data-telemetry-surface-row={row.surface} class="border-b border-border/60 last:border-0">
                <td class="px-2 py-1.5">{row.surface}</td>
                <td class="px-2 py-1.5 text-right font-mono">{row.runs}</td>
                <td class="px-2 py-1.5 text-right font-mono">{row.errors}</td>
                <td class="px-2 py-1.5 text-right font-mono">{row.rate}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </article>

      <!-- Runs-by-step bar chart: OD `.bars`, six-stage spine, now a LayerChart BarChart. -->
      <article
        data-telemetry-chart="runs-by-step"
        class="rounded-lg border border-border bg-card p-4"
      >
        <h3 class="text-[13px] font-semibold">Runs by step</h3>
        <p data-telemetry-stage-spine class="mb-3 text-[11px] text-muted-foreground">
          capture → plan → build → review → ship → operate
        </p>
        <div data-telemetry-runs-chart style="height: 180px;">
          {#if browser}
            <BarChart
              data={runsByStepData}
              x={(d: { short: string }) => d.short}
              y={(d: { runs: number }) => d.runs}
              series={runsByStepSeries}
              tooltip
              grid
              axis
            />
          {:else}
            <div
              class="size-full rounded-md bg-muted"
              style="height: 180px;"
              aria-hidden="true"
            ></div>
          {/if}
        </div>
      </article>

      <!-- Local-resources rate table: OD `.rate-table`. -->
      <article
        data-telemetry-chart="local-resources"
        class="rounded-lg border border-border bg-card p-4"
      >
        <h3 class="text-[13px] font-semibold">Local resources</h3>
        <p class="mb-3 text-[11px] text-muted-foreground">Last sampled 8s ago</p>
        <table data-telemetry-resources-table class="w-full text-xs">
          <tbody>
            <tr data-telemetry-resource-row="cpu" class="border-b border-border/60">
              <td class="px-2 py-1.5">CPU (process)</td>
              <td class="px-2 py-1.5 text-right font-mono">3.2%</td>
              <td class="px-2 py-1.5 text-right font-mono">8c</td>
              <td class="px-2 py-1.5 text-right font-mono">↘</td>
            </tr>
            <tr data-telemetry-resource-row="memory" class="border-b border-border/60">
              <td class="px-2 py-1.5">Memory (RSS)</td>
              <td class="px-2 py-1.5 text-right font-mono">412 MB</td>
              <td class="px-2 py-1.5 text-right font-mono">/ 1.4 GB</td>
              <td class="px-2 py-1.5 text-right font-mono">~</td>
            </tr>
            <tr data-telemetry-resource-row="disk" class="border-b border-border/60">
              <td class="px-2 py-1.5">Disk (data)</td>
              <td class="px-2 py-1.5 text-right font-mono">2.1 GB</td>
              <td class="px-2 py-1.5 text-right font-mono">/ 50 GB</td>
              <td class="px-2 py-1.5 text-right font-mono">~</td>
            </tr>
            <tr data-telemetry-resource-row="mcp-rtt" class="border-b border-border/60">
              <td class="px-2 py-1.5">MCP RTT (avg)</td>
              <td class="px-2 py-1.5 text-right font-mono">42 ms</td>
              <td class="px-2 py-1.5 text-right font-mono"></td>
              <td class="px-2 py-1.5 text-right font-mono">↗</td>
            </tr>
            <tr data-telemetry-resource-row="cold-boot" class="last:border-0">
              <td class="px-2 py-1.5">Cold-boot</td>
              <td class="px-2 py-1.5 text-right font-mono">3.8 s</td>
              <td class="px-2 py-1.5 text-right font-mono">target ≤ 5s</td>
              <td class="px-2 py-1.5 text-right font-mono">✓</td>
            </tr>
          </tbody>
        </table>
      </article>
    </div>
  {:else}
    <!-- ================= TELEMETRY SETTINGS: COPY.md §13 opt-in privacy control ================ -->
    <header data-telemetry-settings-head class="flex flex-wrap items-baseline gap-3.5">
      <h1 data-telemetry-settings-title class="text-[22px] font-semibold tracking-tight">
        Telemetry settings
      </h1>
      <span class="font-mono text-xs text-muted-foreground">
        opt-in privacy control
      </span>
    </header>

    {#if firstRunPending}
      <!-- First-run opt-in prompt: DESIGN.md §11, COPY.md §13. -->
      <section
        data-telemetry-first-run
        class="rounded-lg border border-border bg-card p-4"
        aria-labelledby="telemetry-first-run-heading"
      >
        <h2
          id="telemetry-first-run-heading"
          data-telemetry-first-run-heading
          class="text-sm font-semibold"
        >
          Fulcrum is local-first. All telemetry is opt-in.
        </h2>
        <p class="mt-1 text-xs text-muted-foreground">
          Choose one: this is the first-run prompt; you can change it any time.
        </p>
      </section>
    {/if}

    <section
      data-telemetry-optin
      class="rounded-lg border border-border bg-card p-4"
      aria-labelledby="telemetry-optin-heading"
    >
      <h2 id="telemetry-optin-heading" class="text-sm font-semibold">
        Choose one:
      </h2>

      {#if doNotTrack}
        <p
          data-telemetry-dnt-note
          class="mt-2 rounded-md border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
        >
          <code class="font-mono">DO_NOT_TRACK=1</code> is respected. Telemetry is
          forced <strong class="font-semibold text-foreground">Off</strong> and the
          control is disabled while this environment variable is set.
        </p>
      {/if}

      <RadioGroup
        data-telemetry-optin-group
        value={effectiveMode}
        disabled={doNotTrack}
        onValueChange={setTelemetryMode}
        class="mt-3 flex flex-col gap-2"
      >
        {#each TELEMETRY_OPTIONS as option (option.value)}
          {@const selected = effectiveMode === option.value}
          <label
            data-telemetry-optin-row={option.value}
            data-selected={selected ? "true" : undefined}
            class={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
              selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
              doNotTrack && "cursor-not-allowed opacity-60",
            )}
          >
            <RadioGroupItem
              value={option.value}
              data-telemetry-optin-radio={option.value}
              class="mt-0.5"
            />
            <span class="flex flex-col gap-0.5">
              <span class="text-sm font-medium">{option.label}</span>
              <span data-telemetry-optin-desc={option.value} class="text-xs text-muted-foreground">
                {option.description}
              </span>
            </span>
          </label>
        {/each}
      </RadioGroup>

      <p data-telemetry-optin-help class="mt-3 text-xs text-muted-foreground">
        Set later via
        <code class="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">fulcrum config telemetry on|anon|off</code>
        or
        <code class="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">FULCRUM_TELEMETRY=off</code>
        env var.
        <code class="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">DO_NOT_TRACK=1</code>
        is respected.
      </p>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <span class="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          Equivalent CLI
        </span>
        <code
          data-telemetry-config-command
          class="rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground"
        >{configCommand(effectiveMode)}</code>
      </div>

      {#if firstRunPending}
        <div class="mt-4">
          <button
            type="button"
            data-telemetry-first-run-continue
            class={cn(
              "inline-flex h-8 items-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground",
              "hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
            onclick={continueFirstRun}
          >Continue</button>
        </div>
      {/if}
    </section>

    <!-- Opt-in audit trail: DESIGN.md §11 "no telemetry without opt-in" is recorded. -->
    <section
      data-telemetry-audit
      class="rounded-lg border border-border bg-card p-4"
      aria-labelledby="telemetry-audit-heading"
    >
      <h2 id="telemetry-audit-heading" class="text-sm font-semibold">
        Opt-in audit trail
      </h2>
      <p class="mt-1 text-xs text-muted-foreground">
        Every telemetry opt-in change is recorded locally. No telemetry is
        collected until you explicitly opt in.
      </p>
      {#if auditTrail.length === 0}
        <p data-telemetry-audit-empty class="mt-3 text-xs text-muted-foreground">
          No opt-in changes yet. Telemetry is
          <Badge data-telemetry-audit-current variant="outline">{effectiveMode}</Badge>
         : the local-first default.
        </p>
      {:else}
        <ul data-telemetry-audit-list class="mt-3 flex flex-col gap-1.5">
          {#each auditTrail as entry (entry.at)}
            <li
              data-telemetry-audit-entry
              class="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-xs"
            >
              <span class="font-mono text-[11px] text-muted-foreground">{entry.at}</span>
              <span class="text-muted-foreground">changed</span>
              <Badge variant="outline">{entry.from}</Badge>
              <span aria-hidden="true" class="text-muted-foreground">→</span>
              <Badge>{entry.to}</Badge>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</section>

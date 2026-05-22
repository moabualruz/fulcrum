<script lang="ts">
  /**
   * Operate · Doctor: system-health workbench (`prd-web-operate-doctor-od-fidelity`).
   *
   * OD-fidelity rebuild of the Doctor surface against `operate.html`: a toolbar,
   * a 5-cell summary strip, a subsystem table (Subsystem / Status / Latency p99 /
   * Last check / Recovery / Actions) with inline probe-trace expansion on
   * failing/failed rows, a per-row ModeAffordance row, a contextual recovery
   * primary (Recover / Catch up now / Open PR), and two telemetry tiles.
   *
   * Auto-refresh uses SvelteKit `invalidateAll()` (not `window.location.reload`),
   * so the 30s refresh re-runs the server load WITHOUT discarding row expansion
   * or scroll position: the regression the PRD problem statement names.
   *
   * Design refs: IA-MAP.md §2.6 operate/doctor · DESIGN.md §6 (subsystem table) ·
   * DESIGN.md §10 (Doctor) · DESIGN.md §8.1 (universal mode affordances) ·
   * COPY.md §8 (doctor copy). Composes `@fulcrum/ui-kit` primitives only -
   * `Banner`, `Button`, `Stat`, `StatusBadge`, plus the `ModeRow` via the
   * shared `mode-affordance-host`.
   */
  import { onMount } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { Banner, Button, Stat, StatusBadge } from "@fulcrum/ui-kit";
  import type { WorkflowStatus } from "@fulcrum/ui-kit";
  import {
    ModeRow,
    createStepModeRow,
    modeAffordanceHooks,
  } from "$lib/components/app/mode-affordance-host.ts";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";
  import type {
    ProbeTraceLine,
    RecoveryActionKind,
    SubsystemCheckResult,
    SubsystemStatus,
  } from "./+page.server";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  /** Row expansion state: keyed by subsystem id; preserved across refresh. */
  let expanded = $state<Record<string, boolean>>({});
  /** `HH:MM:SS` of the last completed refresh, shown in the toolbar. */
  let lastRefresh = $state(new Date().toISOString());
  /** True while an `invalidateAll()` refresh is in flight. */
  let refreshing = $state(false);
  /** Last subsystem whose recovery command was copied: drives the copied badge. */
  let copiedCommand = $state<string | null>(null);

  /**
   * Auto-refresh via SvelteKit `invalidateAll()`. Re-running the server load
   * keeps the component instance mounted, so `expanded` and the scroll position
   * survive: unlike the old `window.location.reload()` which tore the page
   * down every 30s (the PRD problem statement).
   */
  async function refreshNow(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    try {
      await invalidateAll();
      lastRefresh = new Date().toISOString();
    } finally {
      refreshing = false;
    }
  }

  onMount(() => {
    const timer = setInterval(() => {
      void refreshNow();
    }, 30_000);
    return () => clearInterval(timer);
  });

  function toggleExpanded(subsystem: string): void {
    expanded[subsystem] = !expanded[subsystem];
  }

  /** Copy a recovery command to the clipboard (COPY.md §8 copy-command button). */
  async function copyCommand(subsystem: string, command: string): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(command);
      } catch {
        // Clipboard denied: the visible command text is still selectable.
      }
    }
    copiedCommand = subsystem;
  }

  /**
   * Map the platform `SubsystemStatus` (`ok | warn | fail`) onto the locked
   * `WorkflowStatus` vocabulary the ui-kit `StatusBadge` enforces (COPY.md §6 /
   * DESIGN.md §10 5-state vocabulary). OD pills `complete | degraded | failed`
   * resolve to `passing | failing | failed`.
   */
  function badgeStatus(status: SubsystemStatus): WorkflowStatus {
    if (status === "ok") return "passing";
    if (status === "warn") return "failing";
    return "failed";
  }

  /** `HH:MM:SS` of an ISO timestamp: the OD `Last check` column form. */
  function hms(iso: string): string {
    return iso.slice(11, 19);
  }

  /** The contextual recovery-primary label per OD `operate.html` row primaries. */
  const RECOVERY_ACTION_LABEL: Record<RecoveryActionKind, string> = {
    recover: "Recover",
    "catch-up": "Catch up now",
    "open-pr": "Open PR",
  };

  /** OKLCH-tokened tone class for a probe-trace transcript line. */
  function traceLineClass(tone: ProbeTraceLine["tone"]): string {
    if (tone === "command") return "text-fg-subtle";
    if (tone === "retry") return "text-warning";
    if (tone === "ok") return "text-success";
    return "text-fg-muted";
  }

  /** A failing or failed row carries the inline probe-trace + recovery primary. */
  function isUnhealthy(check: SubsystemCheckResult): boolean {
    return check.status !== "ok";
  }
</script>

<svelte:head>
  <title>Operate · Doctor</title>
</svelte:head>

<section data-route="operate-doctor" data-stage="operate" class={cn("flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden")}>
  <!-- Toolbar: OD `.toolbar` -->
  <header
    data-doctor-header
    data-slot="doctor-toolbar"
    class={cn("flex flex-wrap items-center gap-3 border-b border-border bg-surface-elevated px-4 py-2.5")}
  >
    <h1 class={cn("flex-1 text-base font-semibold text-fg")}>Doctor · system health</h1>
    <span data-doctor-last-check class={cn("font-mono text-xs text-fg-muted")}>
      last full check: {hms(lastRefresh)}
    </span>
    <Button size="sm" variant="ghost" data-doctor-run-full-check>Run full check</Button>
    <Button size="sm" variant="ghost" data-doctor-filter>Subsystems: all</Button>
    <Button
      size="sm"
      data-refresh-now
      data-doctor-refresh
      disabled={refreshing}
      onclick={refreshNow}
    >{refreshing ? "Refreshing…" : "Refresh now"}</Button>
  </header>

  {#await data.streamed.workbench}
    <RouteSkeleton kind="list" />
  {:then workbench}
    {@const summary = workbench.summary}
    <!-- Degraded / healthy banner: COPY.md §8 doctor banner -->
    {#if summary.failing + summary.failed > 0}
      {@const firstUnhealthy = workbench.checks.find((c) => c.status !== "ok")}
      <Banner
        tone={summary.failed > 0 ? "error" : "warning"}
        title={summary.failed > 0
          ? `${summary.failed} subsystem${summary.failed === 1 ? "" : "s"} failed, ${summary.failing} degraded.`
          : `${summary.failing} subsystem${summary.failing === 1 ? "" : "s"} degraded.`}
        data-doctor-banner="degraded"
        data-doctor-overall={summary.failed > 0 ? "fail" : "warn"}
        data-status={summary.failed > 0 ? "fail" : "warn"}
      >
        {#if firstUnhealthy}
          <span data-doctor-banner-detail>
            {firstUnhealthy.subsystem} ({firstUnhealthy.message}).
          </span>
        {/if}
        {#snippet actions()}
          {#if firstUnhealthy}
            <Button
              size="sm"
              variant="secondary"
              data-doctor-banner-probe
              onclick={() => toggleExpanded(firstUnhealthy.subsystem)}
            >Probe {firstUnhealthy.subsystem}</Button>
          {/if}
          <Button size="sm" data-doctor-banner-reprobe onclick={refreshNow}>Re-probe</Button>
        {/snippet}
      </Banner>
    {:else}
      <Banner tone="success" title="All subsystems healthy." data-doctor-banner="healthy" data-doctor-overall="ok" data-status="ok">
        Last full check {summary.lastGreen}.
        {#snippet actions()}
          <Button size="sm" data-doctor-banner-reprobe onclick={refreshNow}>Re-probe</Button>
        {/snippet}
      </Banner>
    {/if}

    <!-- 5-cell summary strip: OD `.summary` -->
    <div
      data-doctor-summary
      data-slot="doctor-summary"
      class={cn("grid grid-cols-2 border-b border-border sm:grid-cols-3 lg:grid-cols-5")}
    >
      <Stat
        data-doctor-summary-cell="subsystems"
        class={cn("rounded-none border-0 border-b border-r border-border bg-surface-elevated p-3.5")}
        label="Subsystems"
        value={String(summary.subsystems)}
        hint="P1–P17"
      />
      <Stat
        data-doctor-summary-cell="passing"
        class={cn("rounded-none border-0 border-b border-r border-border bg-surface-elevated p-3.5")}
        label="Passing"
        value={String(summary.passing)}
        delta="at SLO"
        trend="up"
      />
      <Stat
        data-doctor-summary-cell="failing"
        class={cn("rounded-none border-0 border-b border-r border-border bg-surface-elevated p-3.5")}
        label="Failing"
        value={String(summary.failing)}
        delta="non-blocking"
        trend={summary.failing > 0 ? "down" : "flat"}
      />
      <Stat
        data-doctor-summary-cell="failed"
        class={cn("rounded-none border-0 border-b border-r border-border bg-surface-elevated p-3.5")}
        label="Failed"
        value={String(summary.failed)}
        delta="non-blocking"
        trend={summary.failed > 0 ? "down" : "flat"}
      />
      <Stat
        data-doctor-summary-cell="last-green"
        class={cn("rounded-none border-0 border-b border-border bg-surface-elevated p-3.5")}
        label="Last green"
        value={summary.lastGreen}
        hint="last all-clear"
      />
    </div>

    <!-- Subsystem table: OD `table.sub` -->
    <div data-slot="table-container" class={cn("flex-1 overflow-auto")}>
      <table data-doctor-table data-slot="table" class={cn("w-full border-collapse text-sm")}>
        <thead>
          <tr class={cn("border-b border-border")}>
            <th class={cn("px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-fg-muted")}>Subsystem</th>
            <th class={cn("px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-fg-muted")}>Status</th>
            <th class={cn("px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-fg-muted")}>Latency p99</th>
            <th class={cn("px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-fg-muted")}>Last check</th>
            <th class={cn("px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-fg-muted")}>Recovery</th>
            <th class={cn("px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-fg-muted")}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each workbench.checks as check (check.subsystem)}
            {@const modeScope = { stepId: check.subsystem, kind: "subsystem-row" as const, title: check.label }}
            {@const modeRow = createStepModeRow(modeScope)}
            <tr
              data-doctor-row
              data-subsystem={check.subsystem}
              data-status={check.status}
              data-expanded={expanded[check.subsystem] ? "true" : undefined}
              {...modeAffordanceHooks(modeScope)}
              class={cn(
                "border-b border-border align-middle hover:bg-surface-sunken",
                expanded[check.subsystem] && check.status !== "ok" && "bg-warning/10",
              )}
            >
              <td class={cn("px-3 py-2 font-medium text-fg")}>{check.label}</td>
              <td class={cn("px-3 py-2")}>
                <StatusBadge data-doctor-status-badge={check.subsystem} status={badgeStatus(check.status)} />
              </td>
              <td data-doctor-latency class={cn("px-3 py-2 font-mono text-xs text-fg-subtle")}>
                {check.latencyP99Ms === null ? "not checked" : `${check.latencyP99Ms} ms`}
              </td>
              <td class={cn("px-3 py-2 font-mono text-xs text-fg-subtle")}>{hms(check.checked_at)}</td>
              <td data-doctor-recovery class={cn("max-w-[28rem] px-3 py-2 leading-relaxed text-fg-subtle")}>
                {#if check.recoveryCopy}
                  <span data-doctor-recovery-copy>{check.recoveryCopy}</span>
                  {#if check.recoveryCommand}
                    <div class={cn("mt-1.5 flex flex-wrap items-center gap-2")}>
                      <code class={cn("rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg")}>{check.recoveryCommand}</code>
                      <Button
                        size="sm"
                        variant="secondary"
                        data-doctor-copy-command
                        data-subsystem={check.subsystem}
                        onclick={() => copyCommand(check.subsystem, check.recoveryCommand ?? "")}
                      >{copiedCommand === check.subsystem ? "Copied" : `Copy: ${check.recoveryCommand}`}</Button>
                    </div>
                  {/if}
                {:else}
                  <span class={cn("text-fg-muted")}>none</span>
                {/if}
              </td>
              <td class={cn("px-3 py-2")}>
                <div class={cn("flex flex-wrap items-center justify-end gap-1.5")}>
                  <Button size="sm" variant="ghost" data-doctor-logs data-subsystem={check.subsystem}>Logs</Button>
                  {#if isUnhealthy(check)}
                    <Button
                      size="sm"
                      variant="secondary"
                      data-doctor-probe
                      data-subsystem={check.subsystem}
                      aria-expanded={expanded[check.subsystem] ?? false}
                      onclick={() => toggleExpanded(check.subsystem)}
                    >Probe</Button>
                    {#if check.recoveryActionKind}
                      <Button
                        size="sm"
                        data-doctor-recovery-action
                        data-subsystem={check.subsystem}
                        data-action-kind={check.recoveryActionKind}
                      >{RECOVERY_ACTION_LABEL[check.recoveryActionKind]}</Button>
                    {/if}
                  {:else}
                    <Button size="sm" variant="secondary" data-doctor-probe data-subsystem={check.subsystem}>Probe</Button>
                  {/if}
                  <div class={cn("basis-full")}>
                    <ModeRow
                      class={cn("justify-end")}
                      data-doctor-mode-row={check.subsystem}
                      data-subsystem={check.subsystem}
                      density={modeRow.density}
                      modes={modeRow.modes}
                      ariaLabel={modeRow.ariaLabel}
                      onSelect={modeRow.onSelect}
                    />
                  </div>
                </div>
              </td>
            </tr>
            {#if expanded[check.subsystem] && check.probeTrace}
              <tr data-doctor-probe-trace-row data-subsystem={check.subsystem}>
                <td colspan="6" class={cn("p-0")}>
                  <div
                    data-doctor-probe-trace
                    data-subsystem={check.subsystem}
                    class={cn("bg-surface-sunken px-4 py-2.5 font-mono text-[11px] leading-relaxed")}
                  >
                    {#each check.probeTrace.lines as line, i (i)}
                      <div class={cn(traceLineClass(line.tone))}>{line.text}</div>
                    {/each}
                    <div data-doctor-probe-trace-id class={cn("text-fg-muted")}>
                      trace {check.probeTrace.traceId}
                    </div>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Telemetry tiles: OD `.telemetry` (DESIGN.md §10 "telemetry row mandatory") -->
    <div
      data-doctor-telemetry
      data-slot="doctor-telemetry"
      class={cn("grid gap-4 border-t border-border bg-surface-sunken p-4 sm:grid-cols-2")}
    >
      {#each workbench.telemetry as tile (tile.id)}
        <div data-doctor-telemetry-tile={tile.id} class={cn("rounded-sm border border-border bg-surface-elevated p-3.5")}>
          <Stat
            class={cn("rounded-none border-0 bg-transparent p-0")}
            label={tile.title}
            value={tile.value}
            delta={tile.delta}
            trend={tile.trend}
          />
          <svg
            viewBox="0 0 200 56"
            preserveAspectRatio="none"
            aria-hidden="true"
            class={cn("mt-2 block h-14 w-full")}
          >
            <polyline
              fill="none"
              stroke={tile.id === "run-success-rate" ? "var(--color-success)" : "var(--color-accent)"}
              stroke-width="2"
              points={tile.sparkline}
            />
          </svg>
          <div class={cn("mt-1.5 flex flex-wrap gap-3 font-mono text-[10px] text-fg-muted")}>
            {#each tile.legend as entry (entry.label)}
              <span class={cn("flex items-center gap-1")}>
                <span
                  aria-hidden="true"
                  class={cn(
                    "inline-block size-2",
                    entry.tone === "ok" && "bg-success",
                    entry.tone === "warn" && "bg-warning",
                    entry.tone === "bad" && "bg-destructive",
                  )}
                ></span>
                {entry.label}
              </span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:catch err}
    <div data-doctor-error class={cn("m-4")}>
      <Banner tone="error" title="Could not load subsystem health.">
        {err?.message ?? String(err)}
        {#snippet actions()}
          <Button size="sm" data-doctor-error-retry onclick={refreshNow}>Retry</Button>
        {/snippet}
      </Banner>
    </div>
  {/await}
</section>

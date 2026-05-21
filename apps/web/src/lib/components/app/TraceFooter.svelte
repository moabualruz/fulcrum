<script lang="ts">
  /*
   * OD StatusFooter consumer (DESIGN.md §3.1, IA-MAP.md §3, desktop-shell.html
   * `.foot-rep`, tui-runs.html `.term-foot`). This route component is a thin
   * data supplier — it owns NO footer chrome markup. The 44px dense operator
   * footer is the `@fulcrum/ui-kit` `StatusFooter` primitive; this file maps
   * shell data (input mode, profile, branch, run progress, agent, MCP health,
   * trace) onto the primitive's segment + right-cluster contract.
   *
   * Per AGENTS.md ui-kit rule the footer is NOT re-implemented route-locally.
   */
  import {
    StatusFooter,
    TraceBadge,
    type StatusFooterMode,
    type StatusFooterSegment,
  } from "@fulcrum/ui-kit";

  interface Props {
    /** Trace id for the current request (DESIGN.md §4.10 TraceBadge identity). */
    traceId?: string | null;
    /** Legacy request-id fallback when no trace id is supplied. */
    requestId?: string | null;
    /** Footer density (DESIGN.md §3.1: compact 38 / base 44 / comfortable 50). */
    mode?: StatusFooterMode;
    /** Input mode pill — vim-style NORMAL/INSERT/FILTER/COMMAND (apps/web CONTEXT.md). */
    inputMode?: string;
    /** Workspace profile (OD `.foot-rep`: `[PRO]`; tui-runs `profile: dev`). */
    profile?: string;
    /** Active branch (OD tui-runs `.term-foot`: `auth/rewrite`). */
    branch?: string;
    /** Run progress `x/y` for the active run, or null when no run is active. */
    runProgress?: string | null;
    /** Active agent label (OD: `agent: claude-opus-4.7`). */
    agent?: string;
    /** MCP server health, e.g. `7/7`. */
    mcpHealth?: string;
    /** Whether MCP health is degraded — flips the segment glyph tone. */
    mcpDegraded?: boolean;
    /** Wall-clock time string for the time segment (OD `.term-foot`: `14:02`). */
    time?: string;
  }

  let {
    traceId = null,
    requestId = null,
    mode = "base",
    inputMode = "NORMAL",
    profile = "PRO",
    branch = "main",
    runProgress = null,
    agent = "claude-opus-4.7",
    mcpHealth = "7/7",
    mcpDegraded = false,
    time,
  }: Props = $props();

  const fallbackTraceId = "trace-local-session";
  const resolvedTraceId = $derived(traceId ?? requestId ?? fallbackTraceId);

  // Clock segment: live HH:MM, refreshed each minute. Server render uses the
  // provided `time` prop (or a stable placeholder) so SSR output is deterministic.
  let clock = $state(time ?? "--:--");

  function formatClock(date: Date): string {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  $effect(() => {
    if (typeof window === "undefined") return;
    if (time) {
      clock = time;
      return;
    }
    clock = formatClock(new Date());
    const id = setInterval(() => {
      clock = formatClock(new Date());
    }, 60_000);
    return () => clearInterval(id);
  });

  // Left cluster: mode pill · profile · branch · run x/y · agent · mcp health
  // (DESIGN.md §3.1 footer line; OD tui-runs `.term-foot` segment order).
  const segments = $derived<StatusFooterSegment[]>(
    [
      { id: "mode", label: inputMode, pill: true },
      { id: "profile", label: profile },
      { id: "branch", label: branch, glyph: "⎇" },
      runProgress ? { id: "run", label: `run ${runProgress}` } : null,
      { id: "agent", label: `agent: ${agent}` },
      { id: "mcp", label: `mcp ${mcpHealth}`, glyph: mcpDegraded ? "◐" : "●" },
    ].filter((s): s is StatusFooterSegment => s !== null),
  );

  function openAiAssist(): void {
    // The AcpDrawer (prd-web-global-ai-assist-drawer) owns the drawer instance
    // and listens for this event so `⌘/` and the footer segment share one
    // drawer. Decoupled window event keeps this footer free of drawer state.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fulcrum:open-ai-assist"));
    }
  }

  function openCommandPalette(): void {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fulcrum:open-command-palette"));
    }
  }
</script>

<StatusFooter
  {mode}
  {segments}
  data-trace-footer
  aiAssistLabel="AI Assist"
  aiAssistShortcut="⌘/"
  onAiAssist={openAiAssist}
>
  {#snippet rightCluster()}
    <!-- Trace: shared DESIGN.md §4.10 TraceBadge — copy + audit/CLI menu. -->
    <TraceBadge
      badge
      data-trace-footer-id
      traceId={resolvedTraceId}
      project="fulcrum"
    />
    <span data-trace-footer-time class="font-mono text-[11px] text-fg-subtle">{clock}</span>
    <button
      type="button"
      data-trace-footer-help
      aria-label="Keyboard shortcuts · ?"
      class="grid size-6 place-items-center rounded-sm text-fg-subtle hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onclick={() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fulcrum:open-shortcut-help"));
        }
      }}
    >
      <span aria-hidden="true">?</span>
    </button>
    <button
      type="button"
      data-trace-footer-palette
      aria-label="Command palette · ⌘K"
      aria-haspopup="dialog"
      class="grid h-6 place-items-center rounded-sm px-1 font-mono text-[11px] text-fg-subtle hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onclick={openCommandPalette}
    >
      <span aria-hidden="true">⌘K</span>
    </button>
  {/snippet}
</StatusFooter>

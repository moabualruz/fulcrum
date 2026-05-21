/**
 * StatusBar widget — the TUI StatusFooter (CLI-TUI-UX.md §8, DESIGN.md §3.1).
 *
 * This widget mirrors the web `@fulcrum/ui-kit` `StatusFooter` primitive
 * (apps/web TraceFooter.svelte) exactly: a single always-on bottom strip whose
 * segments render in one stable left→right order —
 *
 *   mode · profile · branch · run · agent · mcp ···· trace · time · help · palette · AI Assist
 *
 * The `trace`, `run`, and `span` segments are monospace and copy-keybind
 * addressable (`y t` / `y r` / `y s`, CLI-TUI-UX.md §7.6 trace clipboard); the
 * widget exposes `copyKeybinds()` so the keyboard layer can wire the yanks
 * against the exact ids the footer renders.
 *
 * `FOOTER_SEGMENT_ORDER` is the single shared web↔TUI parity matrix — the web
 * footer (TraceFooter.svelte) and this widget are both checked against it so
 * the two surfaces can never drift out of segment order.
 */

import pc from "picocolors";

import { stringWidth, truncateWide } from "../utils/truncate.ts";

/**
 * Canonical web↔TUI status-footer segment order (DESIGN.md §3.1 footer line,
 * CLI-TUI-UX.md §8). Both the web `StatusFooter` consumer and this TUI widget
 * render exactly this order; the parity tests assert against this array so the
 * two surfaces stay locked together.
 */
export const FOOTER_SEGMENT_ORDER = [
  "mode",
  "profile",
  "branch",
  "run",
  "agent",
  "mcp",
  "trace",
  "time",
  "help",
  "palette",
  "ai-assist",
] as const;

export type FooterSegmentId = (typeof FOOTER_SEGMENT_ORDER)[number];

/** A rendered footer segment: stable id + visible text + render hints. */
export interface StatusFooterSegment {
  /** Stable segment id — one of `FOOTER_SEGMENT_ORDER`. */
  id: FooterSegmentId;
  /** Visible label text rendered into the strip. */
  label: string;
  /** Render the label as a monospace identity token (trace/run/span). */
  mono?: boolean;
  /** Copy keybind that yanks this segment's value (`y t`/`y r`/`y s`). */
  copyKeybind?: string;
}

/**
 * StatusFooter input — the shell data the footer maps onto OD segments.
 * `orgName`/`userEmail`/`currentScreen` from the legacy StatusBar are preserved
 * only where they map onto OD segments: `currentScreen` feeds the `mode` pill,
 * `orgName` feeds the workspace `profile`, `userEmail` is dropped (it has no OD
 * footer home — the OD footer carries `profile`, not a user identity).
 */
export interface StatusBarOpts {
  /** Workflow-stage mode shown reverse-video in the `mode` pill (CAPTURE/RUNS/:AI…). */
  currentScreen: string;
  /** Active workspace profile (work / oss / home) — OD `profile:` segment. */
  orgName: string;
  /** @deprecated No OD footer home; accepted for compatibility, not rendered. */
  userEmail?: string;
  /** Active branch under implicit scope (OD `auth/rewrite`). */
  branch?: string;
  /** Run id + position, e.g. `01HXYZ 12/47` (OD `run:<id> 12/47`). */
  run?: string | null;
  /** Active agent for invocations (OD `agent: claude-opus-4-7`). */
  agent?: string;
  /** Healthy/total MCP servers, e.g. `5/5` (OD `mcp:5/5`). */
  mcpHealth?: string;
  /** Whether MCP health is degraded — flips the `mcp` segment glyph + tone. */
  mcpDegraded?: boolean;
  /** Current trace id (DESIGN.md §4.10) — rendered mono, `y t` copyable. */
  traceId?: string | null;
  /** Current run id for the trace spine — rendered mono, `y r` copyable. */
  runId?: string | null;
  /** Current span id for the trace spine — rendered mono, `y s` copyable. */
  spanId?: string | null;
  /** Wall-clock `HH:MM` string (OD `14:02`). */
  time?: string;
  /** Notification bell count — folded into the `help` hint when > 0. */
  bellCount?: number;
  /** Terminal width the footer must fill. */
  width: number;
}

/** Web parity: 8-char hex prefix of a trace id (DESIGN.md §4.10 TraceBadge). */
function traceBadge(id: string): string {
  const hex = id.replace(/^(trace|tr|run|span)[-_:]?/i, "");
  return hex.length > 8 ? `${hex.slice(0, 8)}…` : hex;
}

export class StatusBarWidget {
  private currentScreen: string;
  private profile: string;
  private branch: string;
  private run: string | null;
  private agent: string;
  private mcpHealth: string;
  private mcpDegraded: boolean;
  private traceId: string | null;
  private runId: string | null;
  private spanId: string | null;
  private time: string;
  private bellCount: number;
  private width: number;

  constructor(opts: StatusBarOpts) {
    this.currentScreen = opts.currentScreen;
    this.profile = opts.orgName;
    this.branch = opts.branch ?? "main";
    this.run = opts.run ?? null;
    this.agent = opts.agent ?? "claude-opus-4-7";
    this.mcpHealth = opts.mcpHealth ?? "0/0";
    this.mcpDegraded = opts.mcpDegraded ?? false;
    this.traceId = opts.traceId ?? null;
    this.runId = opts.runId ?? null;
    this.spanId = opts.spanId ?? null;
    this.time = opts.time ?? "--:--";
    this.bellCount = opts.bellCount ?? 0;
    this.width = opts.width;
  }

  setBellCount(count: number): void {
    this.bellCount = count;
  }

  setCurrentScreen(screen: string): void {
    this.currentScreen = screen;
  }

  setProfile(profile: string): void {
    this.profile = profile;
  }

  setBranch(branch: string): void {
    this.branch = branch;
  }

  setRun(run: string | null): void {
    this.run = run;
  }

  setAgent(agent: string): void {
    this.agent = agent;
  }

  setMcpHealth(health: string, degraded = false): void {
    this.mcpHealth = health;
    this.mcpDegraded = degraded;
  }

  setTrace(opts: { traceId?: string | null; runId?: string | null; spanId?: string | null }): void {
    if ("traceId" in opts) this.traceId = opts.traceId ?? null;
    if ("runId" in opts) this.runId = opts.runId ?? null;
    if ("spanId" in opts) this.spanId = opts.spanId ?? null;
  }

  setTime(time: string): void {
    this.time = time;
  }

  /**
   * The footer's eleven segments in canonical `FOOTER_SEGMENT_ORDER`.
   * The `trace` segment carries the trace/run/span identity; `run`/`span` are
   * folded into its mono label and the `copyKeybinds()` map so the keyboard
   * layer can yank each id with `y t` / `y r` / `y s`.
   */
  segments(): StatusFooterSegment[] {
    const trace = this.traceId ? `trace:${traceBadge(this.traceId)}` : "trace:unavailable";
    const help = this.bellCount > 0 ? `? 🔔${this.bellCount}` : "?";
    return [
      { id: "mode", label: this.currentScreen.toUpperCase() },
      { id: "profile", label: `profile: ${this.profile}` },
      { id: "branch", label: `⎇ ${this.branch}` },
      { id: "run", label: this.run ? `run: ${this.run}` : "run: no run", mono: true, copyKeybind: "y r" },
      { id: "agent", label: `agent: ${this.agent}` },
      {
        id: "mcp",
        label: `${this.mcpDegraded ? "◐" : "●"} mcp ${this.mcpHealth}`,
      },
      { id: "trace", label: trace, mono: true, copyKeybind: "y t" },
      { id: "time", label: this.time },
      { id: "help", label: help },
      { id: "palette", label: ":" },
      { id: "ai-assist", label: ":ai" },
    ];
  }

  /**
   * Copy keybinds for the identity segments — `y t` trace, `y r` run, `y s`
   * span (CLI-TUI-UX.md §7.6). The keyboard layer reads this so the yank keys
   * copy exactly the identity the footer displays.
   */
  copyKeybinds(): Record<string, string> {
    const map: Record<string, string> = {};
    if (this.traceId) map["y t"] = this.traceId;
    if (this.runId) map["y r"] = this.runId;
    if (this.spanId) map["y s"] = this.spanId;
    return map;
  }

  render(): string {
    const segs = this.segments();
    // Left cluster: mode·profile·branch·run·agent·mcp.  Right cluster:
    // trace·time·help·palette·AI Assist.  The two clusters are pushed apart so
    // the strip fills the full terminal width and never collapses (CLI-TUI-UX
    // §8 "Never collapses. Never scrolls.").  Width math is wcwidth-aware so
    // double-width glyphs (⎇ ● 🔔) do not truncate or mis-pad the strip.
    const leftIds = new Set<FooterSegmentId>(["mode", "profile", "branch", "run", "agent", "mcp"]);
    const leftSegs = segs.filter((s) => leftIds.has(s.id)).map((s) => s.label);
    const right = segs.filter((s) => !leftIds.has(s.id)).map((s) => s.label).join("  ");

    const inner = Math.max(0, this.width - 2);
    let left = leftSegs.join("  ");
    if (stringWidth(`${left}  ${right}`) > inner) {
      // Width-starved terminal: the footer never drops a segment (CLI-TUI-UX
      // §8). Instead the longest left segment — the agent label — is
      // ellipsized so every segment label stays visible.
      const overflow = stringWidth(`${left}  ${right}`) - inner;
      const agentIdx = leftSegs.length - 2;
      const agent = leftSegs[agentIdx] ?? "";
      leftSegs[agentIdx] = truncateWide(agent, Math.max(6, stringWidth(agent) - overflow));
      left = leftSegs.join("  ");
    }
    const pad = inner - stringWidth(left) - stringWidth(right);
    let body = `${left}${" ".repeat(Math.max(1, pad))}${right}`;
    // Final safety clamp: an extremely narrow terminal physically cannot show
    // every segment — never let the strip overflow the terminal width.
    if (stringWidth(body) > inner) body = truncateWide(body, inner);
    return pc.bgBlue(pc.white(` ${body} `));
  }
}

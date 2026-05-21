/**
 * Build stage workbench: the TUI `:runs` workbench (DESIGN.md §3.1,
 * CLI-TUI-UX.md §6, IA-MAP.md §9; OD `tui-runs.html` `build-runs` screen).
 *
 * This file owns two things:
 *
 *  1. `StageWorkbench`: the shared per-stage workbench shell every stage
 *     screen (Plan / Build / Review / Ship / Operate) renders through. It is
 *     the TUI mirror of the OD `tui-runs.html` `.term` frame: a `term-head`
 *     line (`fulcrum · :<route> · <purpose>` + scope), a primary workbench
 *     body, and the OD StatusFooter strip. It also owns the shared
 *     empty-state and error-frame contract (one sentence + one action; errors
 *     carry `trace=<id>`) so every stage workbench renders states identically.
 *
 *  2. `RunsControlScreen`: the Build stage workbench. A dense runs feed with
 *     status summary, dependency-tree preview, dispatch / cancel / retry /
 *     reassign actions, and a focused-run ModePicker row. Re-homed under the
 *     `StageWorkbench` shell so it carries the same scope chrome and footer as
 *     every other stage.
 *
 * Keybindings:
 *   D      : dispatch new run
 *   C      : cancel selected run
 *   R      : retry failed run
 *   P      : preview dependency tree
 *   A      : reassign agent
 *   m/p/d/a: Step mode picker: ✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI Assist
 *   j/k    : navigate
 *   Enter  : open run detail
 *   q      : go back
 */

import type { Renderer } from "../renderer.ts";
import { c, hRule } from "../renderer.ts";
import { truncateWide } from "../utils/truncate.ts";
import { ModePicker, type WorkflowMode } from "../widgets/ModePicker.ts";

// ─────────────────────────────────────────────────────────────────────────────
// StageWorkbench shell: shared per-stage workbench chrome
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The five workflow stages that own a TUI stage workbench. Capture is covered
 * by `prd-web-capture-stage-shell` (`capture.ts`); these five are owned here.
 */
export type StageWorkbenchStage = "Plan" | "Build" | "Review" | "Ship" | "Operate";

/**
 * The project / stage scope rendered into the workbench `term-head` and the
 * StatusFooter. Mirrors the OD `tui-runs.html` term-head + term-foot segments.
 */
export interface StageWorkbenchScope {
  /** Exact stage name: rendered verbatim in the header (`Plan`, `Build`, …). */
  stage: StageWorkbenchStage;
  /** Canonical colon route for the stage (`:plan`, `:runs`, `:board`, …). */
  route: string;
  /** One-line stage purpose, OD term-head form (`live agent sessions`). */
  purpose: string;
  /** Active project / branch scope (OD `auth-rewrite`). */
  project?: string | null;
  /** Stage-specific scope detail (OD `cycle:24w13`, `PR #4218`, `4 releases`). */
  detail?: string | null;
  /** Active agent for invocations (OD footer `agent: claude-opus-4.7`). */
  agent?: string | null;
  /** Healthy/total MCP servers (OD footer `mcp 7/7`). */
  mcp?: string | null;
  /** Current trace id (OD footer `trace tr_8f29a4c…`). */
  traceId?: string | null;
  /** Focused run id for footer identity (`y r`). */
  runId?: string | null;
  /** Focused span id for footer identity (`y s`). */
  spanId?: string | null;
  /** Active workspace profile (OD footer `profile: dev`). */
  profile?: string | null;
}

/**
 * Render the workbench header: the OD `tui-runs.html` `.term-head` line.
 * Form: `fulcrum · :<route> · <purpose>` on the left, scope on the right.
 * The exact stage name is always present so the snapshot test can lock it.
 */
export function renderStageWorkbenchHeader(renderer: Renderer, scope: StageWorkbenchScope): void {
  const left = `  ${c.bold(scope.stage)}  ${c.dim(`fulcrum · ${scope.route} · ${scope.purpose}`)}`;
  const right = [scope.project, scope.detail].filter(Boolean).join(" · ");
  const width = Math.max(20, renderer.width);
  // Plain-width pad so the right-aligned scope lands at the terminal edge.
  const plainLeft = `  ${scope.stage}  fulcrum · ${scope.route} · ${scope.purpose}`;
  const gap = Math.max(2, width - plainLeft.length - right.length - 2);
  renderer.writeln(truncateWide(`${left}${" ".repeat(gap)}${c.dim(right)}`, width));
  renderer.writeln(c.dim(hRule(width, "─")));
}

/**
 * Render the workbench footer: the OD `tui-runs.html` `.term-foot` strip.
 * Segment order mirrors `StatusBar` / the web `StatusFooter`:
 *   MODE · profile · branch · run · agent · mcp ···· trace · span · ? · :
 * The MODE pill is the upper-cased stage name so each workbench is identifiable.
 *
 * The strip is a single line and never collapses (CONTEXT.md StatusFooter). On
 * a narrow terminal the lower-priority `agent` / `mcp` segments are dropped
 * before the high-priority `trace` segment is: an operator must always be able
 * to read the trace id off the footer regardless of width.
 */
export function renderStageWorkbenchFooter(renderer: Renderer, scope: StageWorkbenchScope): void {
  const width = Math.max(20, renderer.width);
  const mode = c.inverse(` ${scope.stage.toUpperCase()} `);
  const right = [
    `trace ${shortIdentity(scope.traceId)}`,
    `span ${shortIdentity(scope.spanId)}`,
    "?",
    ":",
  ];
  const rightPlain = right.join("  ");
  // Left segments in priority order; drop trailing ones (agent, mcp) first.
  const prioritized = [
    `profile: ${scope.profile ?? "dev"}`,
    `run: ${scope.runId ?? "-"}`,
    scope.project ?? "-",
    `agent: ${scope.agent ?? "any"}`,
    `mcp ${scope.mcp ?? "0/0"}`,
  ];
  let segs = prioritized;
  const fits = (left: string[]): boolean => {
    const leftPlain = ` ${scope.stage.toUpperCase()}   ${left.join("  ")}`;
    return leftPlain.length + rightPlain.length + 4 <= width;
  };
  while (segs.length > 2 && !fits(segs)) {
    segs = segs.slice(0, -1);
  }
  const leftPlain = ` ${scope.stage.toUpperCase()}   ${segs.join("  ")}`;
  const gap = Math.max(2, width - leftPlain.length - rightPlain.length - 2);
  const line = ` ${mode}  ${c.dim(segs.join("  "))}${" ".repeat(gap)}${c.dim(rightPlain)} `;
  renderer.writeln(c.dim(hRule(width, "─")));
  renderer.writeln(truncateWide(line, width));
}

/** Short-form identity id for the footer (OD `tr_8f29a4c…`). */
function shortIdentity(id?: string | null): string {
  if (!id) return "-";
  return id.length > 10 ? `${id.slice(0, 9)}…` : id;
}

/**
 * The shared TUI empty-state contract (CLI-TUI-UX.md §5, DESIGN.md): exactly
 * one sentence describing the empty surface, then exactly one action hint.
 * Every stage workbench renders its empty body through this so the contract
 * never drifts screen to screen.
 */
export function renderWorkbenchEmptyState(
  renderer: Renderer,
  sentence: string,
  action: string,
): void {
  renderer.writeln();
  renderer.writeln(`  ${c.dim(sentence)}`);
  renderer.writeln(`  ${c.cyan(action)}`);
}

/**
 * The shared TUI error-frame contract (CLI-TUI-UX.md §5, DESIGN.md): the
 * `[what failed]. [why]. [next step]. trace=<id>` shape. `trace=<id>` is always
 * appended so an operator can follow the failure across web / CLI / TUI.
 */
export function renderWorkbenchErrorFrame(
  renderer: Renderer,
  failure: { what: string; next: string; traceId?: string | null },
): void {
  const traceId = failure.traceId ?? "unknown";
  renderer.writeln(`  ${c.red(failure.what)}`);
  renderer.writeln(`  ${c.dim(`next: ${failure.next}`)}  ${c.dim(`trace=${traceId}`)}`);
}

/** Plain-text form of the error frame: used by tests and snapshot fixtures. */
export function workbenchErrorFrameText(failure: {
  what: string;
  next: string;
  traceId?: string | null;
}): string {
  return `${failure.what} next: ${failure.next} trace=${failure.traceId ?? "unknown"}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge: the shared 8-state TUI status vocabulary
//
// CLI-TUI-UX.md §11 / DESIGN.md §4.9 lock one universal status vocabulary:
// 8 states, each rendered as glyph + UPPERCASE label, never colour-only
// (WCAG 1.4.1). Every TUI list/header status badge renders through this
// module so the vocabulary cannot drift screen to screen: no more ad hoc
// bracket labels, no more `complete` vs `completed` divergence.
// ─────────────────────────────────────────────────────────────────────────────

/** The 8 canonical status states (CLI-TUI-UX.md §11). */
export type StatusBadgeState =
  | "pending"
  | "running"
  | "complete"
  | "blocked"
  | "awaiting"
  | "failed"
  | "cancelled"
  | "degraded";

/** One canonical status-badge descriptor: the glyph and the exact label. */
interface StatusBadgeToken {
  /** Single-cell glyph from CLI-TUI-UX.md §11. */
  glyph: string;
  /** Exact UPPERCASE label string: asserted verbatim by parity tests. */
  label: string;
  /** Colour function applied to the rendered badge. */
  tone: (s: string) => string;
}

/**
 * The canonical 8-state table: glyph + label + tone exactly as CLI-TUI-UX.md
 * §11 / DESIGN.md §4.9 specify. `running` uses accent, `blocked`/`awaiting`/
 * `degraded` use warn, `failed` uses danger, `cancelled` is muted.
 */
const STATUS_BADGE_TABLE: Record<StatusBadgeState, StatusBadgeToken> = {
  pending: { glyph: "◌", label: "PENDING", tone: c.dim },
  running: { glyph: "●", label: "RUNNING", tone: c.cyan },
  complete: { glyph: "✓", label: "COMPLETE", tone: c.green },
  blocked: { glyph: "⏸", label: "BLOCKED", tone: c.yellow },
  awaiting: { glyph: "⌛", label: "AWAITING", tone: c.yellow },
  failed: { glyph: "✗", label: "FAILED", tone: c.red },
  cancelled: { glyph: "⊘", label: "CANCELLED", tone: c.dim },
  degraded: { glyph: "⚠", label: "DEGRADED", tone: c.yellow },
};

/** The 8 canonical states, in CLI-TUI-UX.md §11 table order. */
export const STATUS_BADGE_STATES: readonly StatusBadgeState[] = [
  "pending",
  "running",
  "complete",
  "blocked",
  "awaiting",
  "failed",
  "cancelled",
  "degraded",
];

/**
 * Alias map: folds the many raw status strings the services emit onto the 8
 * canonical states. `succeeded`/`ok`/`passed` → `complete`; `in_progress` →
 * `running`; `error` → `failed`; `archived` → `cancelled`; review/planning
 * lifecycle strings map onto the nearest canonical state. An unmapped string
 * is treated as `pending` so a badge always renders one of the 8 states.
 */
const STATUS_ALIASES: Record<string, StatusBadgeState> = {
  // pending family
  pending: "pending",
  queued: "pending",
  idle: "pending",
  draft: "pending",
  todo: "pending",
  unknown: "pending",
  // running family
  running: "running",
  in_progress: "running",
  executing: "running",
  planning: "running",
  // complete family
  complete: "complete",
  completed: "complete",
  succeeded: "complete",
  success: "complete",
  ok: "complete",
  passed: "complete",
  pass: "complete",
  approved: "complete",
  // blocked family
  blocked: "blocked",
  changes_requested: "blocked",
  rejected: "blocked",
  // awaiting family
  awaiting: "awaiting",
  awaiting_review: "awaiting",
  // failed family
  failed: "failed",
  fail: "failed",
  error: "failed",
  // cancelled family
  cancelled: "cancelled",
  canceled: "cancelled",
  archived: "cancelled",
  closed: "cancelled",
  skipped: "cancelled",
  // degraded family
  degraded: "degraded",
  partial: "degraded",
};

/** Fold any raw status string onto one of the 8 canonical states. */
export function resolveStatusBadgeState(status: string): StatusBadgeState {
  return STATUS_ALIASES[status.toLowerCase().trim()] ?? "pending";
}

/**
 * Render a status badge: `glyph LABEL`, toned per the canonical table. Every
 * TUI status badge in a list row or header renders through this one helper.
 */
export function renderStatusBadge(status: string): string {
  const token = STATUS_BADGE_TABLE[resolveStatusBadgeState(status)];
  return token.tone(`${token.glyph} ${token.label}`);
}

/** Plain-text `glyph LABEL` form: used by tests and snapshot fixtures. */
export function statusBadgeText(status: string): string {
  const token = STATUS_BADGE_TABLE[resolveStatusBadgeState(status)];
  return `${token.glyph} ${token.label}`;
}

/** The exact UPPERCASE label for a status: `PENDING`, `RUNNING`, … */
export function statusBadgeLabel(status: string): string {
  return STATUS_BADGE_TABLE[resolveStatusBadgeState(status)].label;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TuiRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface TuiRunDep {
  runId: string;
  label: string;
  status: TuiRunStatus | string;
}

export interface TuiManagedRun {
  id: string;
  agent: string;
  status: TuiRunStatus | string;
  taskTitle?: string | null;
  projectName?: string | null;
  startedAt?: string | Date | null;
  deps?: TuiRunDep[];
}

export interface RunsControlScreenOptions {
  projectId?: string;
  /** Project / branch label rendered in the workbench scope chrome. */
  projectLabel?: string;
  /** Active trace id rendered in the workbench footer. */
  traceId?: string | null;
  /** Healthy/total MCP servers rendered in the workbench footer. */
  mcp?: string | null;
  caller: {
    agent_runs: {
      list: (input?: { projectId?: string }) => Promise<TuiManagedRun[]>;
      dispatch: (input: { projectId: string; taskId: string; agent: string }) => Promise<TuiManagedRun>;
      cancel: (input: { id: string }) => Promise<{ ok: boolean }>;
      retry: (input: { id: string }) => Promise<TuiManagedRun>;
      getDeps: (input: { id: string }) => Promise<TuiRunDep[]>;
    };
  };
  onOpenRun?: (id: string) => void;
  viewportRows?: number;
}

type RunsOverlay = "none" | "dispatch" | "deps" | "reassign";

// ─────────────────────────────────────────────────────────────────────────────
// RunsControlScreen: the Build stage workbench
// ─────────────────────────────────────────────────────────────────────────────

export class RunsControlScreen {
  private runs: TuiManagedRun[] = [];
  private cursor = 0;
  private scrollTop = 0;
  private overlay: RunsOverlay = "none";
  private deps: TuiRunDep[] = [];
  private error: string | null = null;
  private reassignment: { from: string; to: string; status: string } | null = null;
  /** The focused-run Step mode picker (✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI Assist). */
  private readonly modePicker = new ModePicker({
    stepId: "run",
    onSelect: (mode) => {
      this.stepMode = mode;
    },
  });
  /** Last Step mode selected via the ModePicker row. */
  private stepMode: WorkflowMode = "manual";

  constructor(private readonly opts: RunsControlScreenOptions) {}

  /** The Step mode currently selected on the focused run (✋/▶/💬/⊞). */
  get currentStepMode(): WorkflowMode {
    return this.stepMode;
  }

  /** The OD stage-scope chrome for the Build runs workbench. */
  private get scope(): StageWorkbenchScope {
    const focused = this.runs[this.cursor];
    return {
      stage: "Build",
      route: ":runs",
      purpose: "live agent sessions",
      project: this.opts.projectLabel ?? this.opts.projectId ?? null,
      detail: `${this.runs.length} runs`,
      agent: focused?.agent ?? null,
      mcp: this.opts.mcp ?? null,
      traceId: this.opts.traceId ?? null,
      runId: focused?.id ?? null,
      spanId: focused ? `span:${focused.id}` : null,
    };
  }

  async load(): Promise<void> {
    try {
      this.runs = await this.opts.caller.agent_runs.list(
        this.opts.projectId ? { projectId: this.opts.projectId } : undefined,
      );
      this.error = null;
      this.clampCursor();
    } catch (err) {
      this.runs = [];
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  render(renderer: Renderer): void {
    renderStageWorkbenchHeader(renderer, this.scope);

    if (this.error) {
      renderWorkbenchErrorFrame(renderer, {
        what: "Runs feed failed to load.",
        next: this.error,
        traceId: this.opts.traceId,
      });
      renderStageWorkbenchFooter(renderer, this.scope);
      return;
    }

    // Status summary: canonical 8-state vocabulary (CLI-TUI-UX.md §11).
    const counts = statusCounts(this.runs);
    renderer.writeln(
      `  ${c.dim("PENDING")} ${counts.pending}  ${c.cyan("RUNNING")} ${counts.running}  ${c.green("COMPLETE")} ${counts.complete}  ${c.yellow("BLOCKED")} ${counts.blocked}  ${c.red("FAILED")} ${counts.failed}`,
    );
    renderer.writeln();
    renderer.writeln(c.bold("  Run list"));

    // Run list: or the shared empty-state contract.
    if (this.runs.length === 0) {
      renderWorkbenchEmptyState(
        renderer,
        "No agent runs in this stage yet.",
        "Press D to dispatch a run.",
      );
    } else {
      const visible = this.visibleRuns;
      for (const run of visible) {
        const index = this.runs.indexOf(run);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        const badge = renderStatusBadge(run.status);
        const project = run.projectName ?? "no project";
        const task = run.taskTitle ?? run.id;
        renderer.writeln(`${pointer} ${badge} ${run.agent}  ${project}  ${task}  ${c.dim(run.id)}`);
      }
      // ModePicker row for the focused run Step (acceptance: Step-bearing rows).
      renderer.writeln();
      renderer.writeln(
        truncateWide(
          `  ${c.dim("step modes")}  ${this.modePicker.render()}`,
          Math.max(20, renderer.width),
        ),
      );
    }

    // Dispatch overlay
    if (this.overlay === "dispatch") {
      renderer.writeln();
      renderer.writeln(c.bold("  Dispatch run"));
      renderer.writeln(c.dim("  Use submitDispatch(projectId, taskId, agent) to dispatch."));
    }

    // Dependency tree overlay
    if (this.overlay === "deps") {
      renderer.writeln();
      const run = this.runs[this.cursor];
      renderer.writeln(c.bold(`  Dependencies for ${run?.id ?? "(none)"}`));
      if (this.deps.length === 0) {
        renderer.writeln(c.dim("  No dependencies."));
      } else {
        for (const dep of this.deps) {
          const depBadge = renderStatusBadge(dep.status);
          renderer.writeln(`  ${depBadge} ${dep.label}  ${c.dim(dep.runId)}`);
        }
      }
    }

    if (this.overlay === "reassign") {
      renderer.writeln();
      renderer.writeln(c.bold("  Reassign agent"));
      renderer.writeln("  claude-code [ready]");
      renderer.writeln("  codex [ready]");
      renderer.writeln("  gemini-cli [paused]");
      if (this.reassignment) {
        renderer.writeln(c.dim(`  Reassign in progress: ${this.reassignment.from} -> ${this.reassignment.to} (${this.reassignment.status})`));
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  D=dispatch  A=reassign agent  C=cancel  R=retry  P=preview deps  m=mode  j/k=navigate  Enter=detail  q=back"));
    renderStageWorkbenchFooter(renderer, this.scope);
  }

  async handleKey(key: string): Promise<boolean> {
    // Close overlay on Escape
    if (key === "\x1b" && this.overlay !== "none") {
      this.overlay = "none";
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.runs.length - 1));
      this.keepCursorVisible();
      if (this.overlay === "deps") this.overlay = "none";
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      this.keepCursorVisible();
      if (this.overlay === "deps") this.overlay = "none";
      return true;
    }

    // Lowercase p/d/m/a are owned by the focused Step ModePicker. Uppercase
    // action keys keep the workbench commands addressable.
    if (this.modePicker.handleKey(key)) return true;

    if (key === "D") {
      this.overlay = "dispatch";
      return true;
    }

    if (key === "A") {
      const run = this.runs[this.cursor];
      this.overlay = "reassign";
      if (run) {
        this.reassignment = { from: run.agent, to: "codex", status: "copied transcript seed" };
      }
      return true;
    }

    if (key === "C" || key === "c") {
      const run = this.runs[this.cursor];
      if (!run) return false;
      try {
        await this.opts.caller.agent_runs.cancel({ id: run.id });
        run.status = "cancelled";
        this.error = null;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
      return true;
    }

    if (key === "R" || key === "r") {
      const run = this.runs[this.cursor];
      if (!run) return false;
      try {
        const retried = await this.opts.caller.agent_runs.retry({ id: run.id });
        // Replace the failed run in-place with the retried version
        const idx = this.runs.findIndex((r) => r.id === run.id);
        if (idx >= 0) this.runs[idx] = retried;
        this.error = null;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
      return true;
    }

    if (key === "P") {
      const run = this.runs[this.cursor];
      if (!run) return false;
      try {
        this.deps = await this.opts.caller.agent_runs.getDeps({ id: run.id });
        this.overlay = "deps";
        this.error = null;
      } catch (err) {
        this.deps = [];
        this.error = err instanceof Error ? err.message : String(err);
      }
      return true;
    }

    if (key === "\r" || key === "\n") {
      const run = this.runs[this.cursor];
      if (!run) return false;
      this.opts.onOpenRun?.(run.id);
      return true;
    }

    return false;
  }

  /** Dispatch a new run and prepend to the list. */
  async submitDispatch(input: { projectId: string; taskId: string; agent: string }): Promise<void> {
    try {
      const run = await this.opts.caller.agent_runs.dispatch(input);
      this.runs = [run, ...this.runs];
      this.cursor = 0;
      this.scrollTop = 0;
      this.overlay = "none";
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  get visibleRuns(): readonly TuiManagedRun[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.runs.slice(this.scrollTop, this.scrollTop + rows);
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.runs.length - 1));
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 20;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function statusCounts(runs: TuiManagedRun[]): Record<StatusBadgeState, number> {
  const counts: Record<StatusBadgeState, number> = {
    pending: 0,
    running: 0,
    complete: 0,
    blocked: 0,
    awaiting: 0,
    failed: 0,
    cancelled: 0,
    degraded: 0,
  };
  for (const run of runs) {
    counts[resolveStatusBadgeState(run.status)]++;
  }
  return counts;
}

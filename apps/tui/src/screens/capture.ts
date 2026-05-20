/**
 * Capture stage — the TUI `:capture` workbench plus the review-state helpers
 * it absorbs (`prd-web-capture-stage-shell`; CLI-TUI-UX.md §9; OD
 * `capture.html`, `capture-drafts.html`, `capture-promoted.html`).
 *
 * This file owns two things:
 *
 *  1. `CaptureWorkbenchScreen` — the `:capture` (alias `:inbox`) stage
 *     workbench. It renders the four Capture views — Inbox, Seedlings,
 *     Drafts, Promoted — through the shared `StageWorkbench` shell so it
 *     carries the same OD term-head + StatusFooter chrome as every other
 *     stage. Each Capture Step row carries the universal `ModePicker` mode
 *     affordance (✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI Assist).
 *
 *  2. The review-state helpers (`submitReviewNote`, `setCaptureStatus`,
 *     `applyQuickAction`, `captureSummary`) — kept as the Capture review-state
 *     logic the workbench drives (design-alignment/capture.md disposition:
 *     "absorb → review-state helpers behind the `:capture` workbench").
 *
 * Keybindings (`:capture` workbench):
 *   1 2 3 4 — switch to Inbox / Seedlings / Drafts / Promoted view
 *   j / k   — move the Step cursor
 *   m …     — Step mode chord: m a ✋ / m p ▶ / m d 💬 / m i ⊞
 *   P       — hand off the focused Step to Plan (preserves trace)
 *   q       — go back
 */

import { renderWorkbenchEmptyState } from "./runs-screen.ts";
import type { Renderer } from "../renderer.ts";
import { c, hRule } from "../renderer.ts";
import { truncateWide } from "../utils/truncate.ts";
import { ModePicker } from "../widgets/ModePicker.ts";

export type CaptureStatus = "triage" | "in_review" | "approved" | "blocked" | "escalated";

export type CaptureQuickAction = "assign" | "block" | "approve" | "escalate";

export interface CaptureReviewState {
  captureId: string;
  status: CaptureStatus;
  note: string;
  assignee: string | null;
  history: CaptureReviewEvent[];
}

export interface CaptureReviewEvent {
  occurredAt: string;
  kind: "status" | "note" | "action";
  payload: string;
}

export interface CaptureReviewEnv {
  now?: () => Date;
}

export function submitReviewNote(state: CaptureReviewState, note: string, env: CaptureReviewEnv = {}): CaptureReviewState {
  const trimmed = note.trim();
  if (!trimmed) return state;
  const occurredAt = (env.now ?? (() => new Date()))().toISOString();
  return {
    ...state,
    note: trimmed,
    history: [...state.history, { occurredAt, kind: "note", payload: trimmed }],
  };
}

export function setCaptureStatus(state: CaptureReviewState, status: CaptureStatus, env: CaptureReviewEnv = {}): CaptureReviewState {
  if (state.status === status) return state;
  const occurredAt = (env.now ?? (() => new Date()))().toISOString();
  return {
    ...state,
    status,
    history: [...state.history, { occurredAt, kind: "status", payload: status }],
  };
}

export function applyQuickAction(state: CaptureReviewState, action: CaptureQuickAction, args: { assignee?: string | null } = {}, env: CaptureReviewEnv = {}): CaptureReviewState {
  const occurredAt = (env.now ?? (() => new Date()))().toISOString();
  switch (action) {
    case "assign": {
      const assignee = args.assignee ?? null;
      const payload = assignee ?? "unassigned";
      return {
        ...state,
        assignee,
        history: [...state.history, { occurredAt, kind: "action", payload: `assign:${payload}` }],
      };
    }
    case "block":
      return setCaptureStatus({ ...state, history: [...state.history, { occurredAt, kind: "action", payload: "block" }] }, "blocked", env);
    case "approve":
      return setCaptureStatus({ ...state, history: [...state.history, { occurredAt, kind: "action", payload: "approve" }] }, "approved", env);
    case "escalate":
      return setCaptureStatus({ ...state, history: [...state.history, { occurredAt, kind: "action", payload: "escalate" }] }, "escalated", env);
  }
}

export function captureSummary(state: CaptureReviewState): string {
  const assignee = state.assignee ?? "unassigned";
  return `${state.captureId} • ${state.status} • ${assignee}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CaptureWorkbenchScreen — the TUI `:capture` stage workbench
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The four Capture workbench views (CLI-TUI-UX.md §9: `:capture` intake queue
 * with filters · drafts · promoted side pane; OD `capture-drafts.html` /
 * `capture-promoted.html`). `seedlings` is the OD document-maturity view —
 * half-formed captures not yet promoted (OD `capture.html` crumb `seedlings`).
 */
export type CaptureWorkbenchView = "inbox" | "seedlings" | "drafts" | "promoted";

/** The four Capture views in OD/keystroke order — `1 2 3 4` selects them. */
export const CAPTURE_WORKBENCH_VIEWS: readonly CaptureWorkbenchView[] = [
  "inbox",
  "seedlings",
  "drafts",
  "promoted",
];

/** One Capture Step row rendered in the workbench — a draft / promoted / intake item. */
export interface CaptureWorkbenchStep {
  /** Stable addressable Step id (`cap_8f29a4c`). */
  id: string;
  /** Step title — one line. */
  title: string;
  /** One-line preview / summary. */
  preview: string;
  /** Mono meta string (age · words · author). */
  meta: string;
  /** Optional downstream link target shown on a promoted row (`→ plan_8f29`). */
  downstream?: string;
}

/** The Capture Step rows for each Capture workbench view. */
export type CaptureWorkbenchData = Record<CaptureWorkbenchView, CaptureWorkbenchStep[]>;

/** Construction options for the `:capture` workbench screen. */
export interface CaptureWorkbenchOptions {
  /** Capture Step rows per view. Empty arrays render the shared empty-state. */
  data?: Partial<CaptureWorkbenchData>;
  /** Active project / branch scope (OD term-head `auth-rewrite`). */
  projectLabel?: string | null;
  /** Active trace id — carried into the StatusFooter and the Plan handoff. */
  traceId?: string | null;
  /** Healthy/total MCP servers for the StatusFooter (`7/7`). */
  mcp?: string | null;
}

/** The result of a Capture → Plan handoff — preserves the trace identity. */
export interface CaptureHandoff {
  /** The Capture Step that was handed off. */
  stepId: string;
  /** The trace id carried into the planning session (IA-MAP §2.1). */
  traceId: string | null;
  /** The colon route the handoff opens (`:plan`). */
  route: string;
}

/**
 * The `:capture` (alias `:inbox`) stage workbench. Renders the Capture stage
 * in the TUI: a view switcher across Inbox / Seedlings / Drafts / Promoted, a
 * Step list, and the per-Step `ModePicker` affordance row, all inside the
 * shared `StageWorkbench` shell (OD term-head + StatusFooter).
 *
 * The screen owns no data fetching — the caller seeds `data`; an empty view
 * renders the shared one-sentence + one-action empty-state contract.
 */
export class CaptureWorkbenchScreen {
  private view: CaptureWorkbenchView = "inbox";
  private cursor = 0;
  private readonly data: CaptureWorkbenchData;
  private lastHandoff: CaptureHandoff | null = null;
  /** The focused-Step mode picker (✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI Assist). */
  private readonly modePicker = new ModePicker({ stepId: "capture" });

  constructor(private readonly opts: CaptureWorkbenchOptions = {}) {
    this.data = {
      inbox: opts.data?.inbox ?? [],
      seedlings: opts.data?.seedlings ?? [],
      drafts: opts.data?.drafts ?? [],
      promoted: opts.data?.promoted ?? [],
    };
  }

  /** The active Capture view. */
  get currentView(): CaptureWorkbenchView {
    return this.view;
  }

  /** The Capture Step the cursor is on, or `null` when the view is empty. */
  get focusedStep(): CaptureWorkbenchStep | null {
    return this.steps[this.cursor] ?? null;
  }

  /** The last Capture → Plan handoff, or `null` when none has been made. */
  get handoff(): CaptureHandoff | null {
    return this.lastHandoff;
  }

  /** The Step rows of the active view. */
  private get steps(): CaptureWorkbenchStep[] {
    return this.data[this.view];
  }

  /** Switch the active Capture view; clamps the cursor into the new view. */
  setView(view: CaptureWorkbenchView): void {
    this.view = view;
    this.cursor = 0;
  }

  /**
   * Hand the focused Capture Step off to Plan. The trace id allocated on the
   * capture survives into the planning session (IA-MAP §2.1 "Trace ID
   * allocated here" / "Hand off to Plan"). Returns the handoff, or `null` when
   * the active view is empty.
   */
  handOffToPlan(): CaptureHandoff | null {
    const step = this.focusedStep;
    if (!step) return null;
    this.lastHandoff = {
      stepId: step.id,
      traceId: this.opts.traceId ?? null,
      route: ":plan",
    };
    return this.lastHandoff;
  }

  /** Handle a keystroke. Returns `true` when the key was consumed. */
  handleKey(key: string): boolean {
    // The `m` Step-mode chord takes precedence so `m`-then-selector never
    // collides with the screen action keys.
    if (this.modePicker.handleChordKey(key)) return true;
    switch (key) {
      case "1":
        this.setView("inbox");
        return true;
      case "2":
        this.setView("seedlings");
        return true;
      case "3":
        this.setView("drafts");
        return true;
      case "4":
        this.setView("promoted");
        return true;
      case "j":
        this.cursor = Math.min(this.cursor + 1, Math.max(0, this.steps.length - 1));
        return true;
      case "k":
        this.cursor = Math.max(this.cursor - 1, 0);
        return true;
      case "P":
        this.handOffToPlan();
        return true;
      default:
        return false;
    }
  }

  /**
   * Render the Capture workbench header — the OD `tui` `.term-head` form,
   * `fulcrum · :capture · <purpose>` on the left, project + view scope right.
   * Capture is the sixth stage shell; the `StageWorkbench` type covers only
   * the other five, so the Capture header is rendered locally to keep the
   * `Capture` stage label honest.
   */
  private renderHeader(renderer: Renderer): void {
    const width = Math.max(20, renderer.width);
    const left = `  ${c.bold("Capture")}  ${c.dim("fulcrum · :capture · capture intake, drafts, and promotions")}`;
    const rightPlain = [this.opts.projectLabel, `${this.steps.length} ${this.view}`]
      .filter(Boolean)
      .join(" · ");
    const plainLeft = "  Capture  fulcrum · :capture · capture intake, drafts, and promotions";
    const gap = Math.max(2, width - plainLeft.length - rightPlain.length - 2);
    renderer.writeln(truncateWide(`${left}${" ".repeat(gap)}${c.dim(rightPlain)}`, width));
    renderer.writeln(c.dim(hRule(width, "─")));
  }

  /**
   * Render the Capture workbench footer — the OD `.term-foot` strip with the
   * `CAPTURE` MODE pill and the trace segment. Mirrors the StatusFooter shape;
   * the trace id is always present so a Capture action is followable across
   * web / CLI / TUI by the same id.
   */
  private renderFooter(renderer: Renderer): void {
    const width = Math.max(20, renderer.width);
    const mode = c.inverse(" CAPTURE ");
    const traceId = this.opts.traceId ?? "—";
    const trace = traceId.length > 10 ? `${traceId.slice(0, 9)}…` : traceId;
    const left = [`profile: dev`, this.opts.projectLabel ?? "—", `mcp ${this.opts.mcp ?? "0/0"}`].join("  ");
    const right = [`trace ${trace}`, "?", ":"].join("  ");
    const leftPlain = ` CAPTURE   ${left}`;
    const gap = Math.max(2, width - leftPlain.length - right.length - 2);
    renderer.writeln(c.dim(hRule(width, "─")));
    renderer.writeln(truncateWide(` ${mode}  ${c.dim(left)}${" ".repeat(gap)}${c.dim(right)} `, width));
  }

  /** Render the `:capture` workbench — header, view switcher, Steps, footer. */
  render(renderer: Renderer): void {
    this.renderHeader(renderer);

    // Capture view switcher — Inbox / Seedlings / Drafts / Promoted.
    const width = Math.max(20, renderer.width);
    const tabs = CAPTURE_WORKBENCH_VIEWS.map((view, index) => {
      const label = `${index + 1} ${view}`;
      return view === this.view ? c.inverse(` ${label} `) : c.dim(` ${label} `);
    });
    renderer.writeln(`  ${tabs.join("  ")}`);
    renderer.writeln(c.dim(hRule(width, "─")));

    const steps = this.steps;
    if (steps.length === 0) {
      renderWorkbenchEmptyState(
        renderer,
        emptySentenceFor(this.view),
        emptyActionFor(this.view),
      );
      this.renderFooter(renderer);
      return;
    }

    for (const step of steps) {
      const index = steps.indexOf(step);
      const pointer = index === this.cursor ? c.bold(">") : " ";
      const downstream = step.downstream ? `  ${c.cyan(step.downstream)}` : "";
      renderer.writeln(
        truncateWide(`${pointer} ${c.bold(step.title)}${downstream}`, width),
      );
      renderer.writeln(truncateWide(`    ${c.dim(step.preview)}`, width));
      renderer.writeln(truncateWide(`    ${c.dim(step.meta)}`, width));
    }

    // Per-Step ModePicker affordance row — a Capture Step is a Step (DESIGN.md
    // §4.13). Every Capture row exposes ✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI Assist.
    renderer.writeln();
    renderer.writeln(
      truncateWide(`  ${c.dim("step modes")}  ${this.modePicker.render()}`, width),
    );

    // Hand-off cue — the focused Step can be promoted into Plan.
    renderer.writeln();
    renderer.writeln(`  ${c.cyan("P")} ${c.dim("hand off to Plan (preserves trace)")}`);
    if (this.lastHandoff) {
      renderer.writeln(
        `  ${c.green("→")} ${c.dim(`handed off ${this.lastHandoff.stepId} to ${this.lastHandoff.route} · trace=${this.lastHandoff.traceId ?? "unknown"}`)}`,
      );
    }

    this.renderFooter(renderer);
  }
}

/** The one-sentence empty-state copy for a Capture view (CLI-TUI-UX.md §5). */
function emptySentenceFor(view: CaptureWorkbenchView): string {
  switch (view) {
    case "inbox":
      return "Inbox is clear — no captures waiting for triage.";
    case "seedlings":
      return "No seedlings yet — half-formed captures appear here.";
    case "drafts":
      return "No drafts yet.";
    case "promoted":
      return "No promoted captures yet.";
  }
}

/** The one-action empty-state hint for a Capture view (CLI-TUI-UX.md §5). */
function emptyActionFor(view: CaptureWorkbenchView): string {
  switch (view) {
    case "promoted":
      return "Press 3 to open Drafts and promote one.";
    default:
      return "Press c to capture.";
  }
}

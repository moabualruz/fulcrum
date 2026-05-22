/**
 * Review stage workbench: the TUI `:review` workbench (DESIGN.md §3.1,
 * CLI-TUI-UX.md §6, IA-MAP.md §9; OD `tui-runs.html` `review` screen).
 *
 * The Review stage's QA / review-session surface, re-homed under the shared
 * `StageWorkbench` shell so it carries the same `fulcrum · :review · …`
 * header, StatusFooter strip, and empty/error contract as every other stage.
 * Shows QA report status (pass/fail per criterion), lists review sessions,
 * and provides actions: load session, start review, approve/request-changes.
 *
 * Keybindings:
 *   R      : refresh
 *   A      : approve
 *   X      : request changes
 *   S      : save session
 *   m …    : Step mode picker chord: m a ✋ Manual / m p ▶ Play /
 *             m d 💬 Discuss / m i ⊞ AI Assist (collision-free `m` prefix)
 *   j/k    : navigate
 *   Enter  : open session detail
 *   q      : go back
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import { truncateWide } from "../utils/truncate.ts";
import { ModePicker, type WorkflowMode } from "../widgets/ModePicker.ts";
import {
  renderStageWorkbenchFooter,
  renderStageWorkbenchHeader,
  renderStatusBadge,
  renderWorkbenchEmptyState,
  renderWorkbenchErrorFrame,
  type StageWorkbenchScope,
} from "./runs-screen.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TuiQaCriterion {
  name: string;
  status: "pass" | "fail" | "pending" | "skipped";
  detail?: string;
}

export interface TuiReviewSession {
  id: string;
  title: string;
  status: "draft" | "in_progress" | "approved" | "changes_requested" | "closed";
  reviewer?: string;
  createdAt?: string;
  criteria?: TuiQaCriterion[];
}

export interface ReviewScreenOptions {
  projectId?: string;
  /** Project / branch label rendered in the workbench scope chrome. */
  projectLabel?: string;
  /** Active trace id rendered in the workbench footer. */
  traceId?: string | null;
  /** Healthy/total MCP servers rendered in the workbench footer. */
  mcp?: string | null;
  caller: {
    reviews: {
      listSessions: (input?: { projectId?: string }) => Promise<TuiReviewSession[]>;
      getSession: (input: { id: string }) => Promise<TuiReviewSession>;
      startReview: (input: { projectId?: string }) => Promise<TuiReviewSession>;
      approve: (input: { sessionId: string }) => Promise<{ ok: boolean }>;
      requestChanges: (input: { sessionId: string; comment?: string }) => Promise<{ ok: boolean }>;
      saveSession: (input: { sessionId: string }) => Promise<{ ok: boolean }>;
    };
  };
  onOpenSession?: (id: string) => void;
  viewportRows?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ReviewScreen
// ─────────────────────────────────────────────────────────────────────────────

export class ReviewScreen {
  private sessions: TuiReviewSession[] = [];
  private cursor = 0;
  private scrollTop = 0;
  private error: string | null = null;
  /** The focused review-item Step mode picker (✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI Assist). */
  private readonly modePicker = new ModePicker({
    stepId: "review",
    onSelect: (mode) => {
      this.stepMode = mode;
    },
  });
  /** Last Step mode selected via the ModePicker row. */
  private stepMode: WorkflowMode = "manual";

  constructor(private readonly opts: ReviewScreenOptions) {}

  /** The Step mode currently selected on the focused review item (✋/▶/💬/⊞). */
  get currentStepMode(): WorkflowMode {
    return this.stepMode;
  }

  /** The OD stage-scope chrome for the Review workbench. */
  private get scope(): StageWorkbenchScope {
    return {
      stage: "Review",
      route: ":review",
      purpose: "review queue",
      project: this.opts.projectLabel ?? this.opts.projectId ?? null,
      detail: `${this.sessions.length} sessions`,
      agent: this.sessions[this.cursor]?.reviewer ?? null,
      mcp: this.opts.mcp ?? null,
      traceId: this.opts.traceId ?? null,
    };
  }

  async load(): Promise<void> {
    try {
      this.sessions = await this.opts.caller.reviews.listSessions(
        this.opts.projectId ? { projectId: this.opts.projectId } : undefined,
      );
      this.error = null;
      this.clampCursor();
    } catch (err) {
      this.sessions = [];
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  render(renderer: Renderer): void {
    renderStageWorkbenchHeader(renderer, this.scope);

    if (this.error) {
      renderWorkbenchErrorFrame(renderer, {
        what: "Review sessions failed to load.",
        next: this.error,
        traceId: this.opts.traceId,
      });
      renderStageWorkbenchFooter(renderer, this.scope);
      return;
    }

    if (this.sessions.length === 0) {
      renderWorkbenchEmptyState(
        renderer,
        "No review sessions in this stage yet.",
        "Press R to start a review.",
      );
      renderer.writeln();
      renderer.writeln(c.dim("  R=refresh  q=back"));
      renderStageWorkbenchFooter(renderer, this.scope);
      return;
    }

    // QA summary for selected session
    const selected = this.sessions[this.cursor];
    if (selected?.criteria && selected.criteria.length > 0) {
      renderer.writeln(c.bold("  QA Report"));
      for (const criterion of selected.criteria) {
        renderer.writeln(`  ${renderStatusBadge(criterion.status)} ${criterion.name}${criterion.detail ? c.dim(`  ${criterion.detail}`) : ""}`);
      }
      renderer.writeln();
    }

    // Session list
    renderer.writeln(c.bold("  Sessions"));
    const visible = this.visibleSessions;
    for (const session of visible) {
      const index = this.sessions.indexOf(session);
      const pointer = index === this.cursor ? c.bold(">") : " ";
      const badge = renderStatusBadge(session.status);
      const reviewer = session.reviewer ? c.dim(` @${session.reviewer}`) : "";
      const date = session.createdAt ? c.dim(` ${session.createdAt}`) : "";
      renderer.writeln(`${pointer} ${badge} ${session.title}${reviewer}${date}  ${c.dim(session.id)}`);
    }

    // ModePicker row for the focused review-item Step (acceptance: Step-bearing rows).
    renderer.writeln();
    renderer.writeln(
      truncateWide(
        `  ${c.dim("step modes")}  ${this.modePicker.render()}`,
        Math.max(20, renderer.width),
      ),
    );
    for (const line of this.modePicker.renderPopover()) {
      renderer.writeln(truncateWide(line, Math.max(20, renderer.width)));
    }

    renderer.writeln();
    renderer.writeln(c.dim("  R=refresh  A=approve  X=request-changes  S=save  p play  d discuss  m picker  j/k=navigate  Enter=open  q=back"));
    renderStageWorkbenchFooter(renderer, this.scope);
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.sessions.length - 1));
      this.keepCursorVisible();
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      this.keepCursorVisible();
      return true;
    }

    // Step mode picker direct keys.
    if (this.modePicker.handleChordKey(key)) return true;

    if (key === "R" || key === "r") {
      await this.load();
      return true;
    }

    if (key === "A" || key === "a") {
      const session = this.sessions[this.cursor];
      if (!session) return false;
      try {
        await this.opts.caller.reviews.approve({ sessionId: session.id });
        session.status = "approved";
        this.error = null;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
      return true;
    }

    if (key === "X" || key === "x") {
      const session = this.sessions[this.cursor];
      if (!session) return false;
      try {
        await this.opts.caller.reviews.requestChanges({ sessionId: session.id });
        session.status = "changes_requested";
        this.error = null;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
      return true;
    }

    if (key === "S" || key === "s") {
      const session = this.sessions[this.cursor];
      if (!session) return false;
      try {
        await this.opts.caller.reviews.saveSession({ sessionId: session.id });
        this.error = null;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
      return true;
    }

    if (key === "\r" || key === "\n") {
      const session = this.sessions[this.cursor];
      if (!session) return false;
      this.opts.onOpenSession?.(session.id);
      return true;
    }

    return false;
  }

  /** Start a new review and prepend to sessions list. */
  async startNewReview(): Promise<void> {
    try {
      const session = await this.opts.caller.reviews.startReview(
        this.opts.projectId ? { projectId: this.opts.projectId } : {},
      );
      this.sessions = [session, ...this.sessions];
      this.cursor = 0;
      this.scrollTop = 0;
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  get visibleSessions(): readonly TuiReviewSession[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.sessions.slice(this.scrollTop, this.scrollTop + rows);
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.sessions.length - 1));
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 20;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }
}

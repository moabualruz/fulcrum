/**
 * ReviewScreen — TUI review workbench (W5).
 *
 * Shows QA report status (pass/fail per criterion), lists review sessions,
 * and provides actions: load session, start review, approve/request-changes.
 *
 * Keybindings:
 *   R       — refresh
 *   A       — approve
 *   X       — request changes
 *   S       — save session
 *   j/k     — navigate
 *   Enter   — open session detail
 *   q       — go back
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

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

  constructor(private readonly opts: ReviewScreenOptions) {}

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
    renderer.writeln();
    renderer.writeln(c.bold("  Review Workbench"));
    renderer.separator();
    renderer.writeln();

    if (this.error) {
      renderer.writeln(c.red(`  ${this.error}`));
      renderer.writeln();
    }

    // QA summary for selected session
    const selected = this.sessions[this.cursor];
    if (selected?.criteria && selected.criteria.length > 0) {
      renderer.writeln(c.bold("  QA Report"));
      for (const criterion of selected.criteria) {
        renderer.writeln(`  ${criterionBadge(criterion.status)} ${criterion.name}${criterion.detail ? c.dim(`  ${criterion.detail}`) : ""}`);
      }
      renderer.writeln();
    }

    // Session list
    renderer.writeln(c.bold("  Sessions"));
    if (this.sessions.length === 0) {
      renderer.writeln(c.dim("  No review sessions."));
    } else {
      const visible = this.visibleSessions;
      for (const session of visible) {
        const index = this.sessions.indexOf(session);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        const badge = sessionStatusBadge(session.status);
        const reviewer = session.reviewer ? c.dim(` @${session.reviewer}`) : "";
        const date = session.createdAt ? c.dim(` ${session.createdAt}`) : "";
        renderer.writeln(`${pointer} ${badge} ${session.title}${reviewer}${date}  ${c.dim(session.id)}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  R=refresh  A=approve  X=request-changes  S=save  j/k=navigate  Enter=open  q=back"));
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function criterionBadge(status: string): string {
  if (status === "pass") return c.green("[PASS]");
  if (status === "fail") return c.red("[FAIL]");
  if (status === "pending") return c.yellow("[PEND]");
  if (status === "skipped") return c.dim("[SKIP]");
  return `[${status}]`;
}

function sessionStatusBadge(status: string): string {
  if (status === "approved") return c.green("[approved]");
  if (status === "changes_requested") return c.red("[changes]");
  if (status === "in_progress") return c.yellow("[in progress]");
  if (status === "draft") return c.dim("[draft]");
  if (status === "closed") return c.dim("[closed]");
  return `[${status}]`;
}

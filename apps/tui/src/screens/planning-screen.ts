/**
 * Plan stage workbench — the TUI `:plan` workbench (DESIGN.md §3.1,
 * CLI-TUI-UX.md §6, IA-MAP.md §9; OD `tui-runs.html` `plan` screen).
 *
 * The Plan stage's planning-sessions surface, re-homed under the shared
 * `StageWorkbench` shell so it carries the same `fulcrum · :plan · …` header,
 * StatusFooter strip, and empty/error contract as every other stage workbench.
 * Shows current planning state, starts guided ACP or freeform planning
 * sessions, and displays session status with traffic info.
 *
 * Keybindings:
 *   G       — start guided ACP session
 *   F       — start freeform planning
 *   R       — refresh state
 *   j/k     — navigate sessions
 *   Enter   — open session detail
 *   q       — go back
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import {
  renderStageWorkbenchFooter,
  renderStageWorkbenchHeader,
  renderWorkbenchEmptyState,
  renderWorkbenchErrorFrame,
  type StageWorkbenchScope,
} from "./runs-screen.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TuiPlanningSessionStatus =
  | "idle"
  | "planning"
  | "awaiting_review"
  | "approved"
  | "rejected"
  | "executing";

export interface TuiPlanningTrafficEntry {
  method: string;
  timestamp?: string;
}

export interface TuiPlanningSession {
  id: string;
  title: string;
  status: TuiPlanningSessionStatus | string;
  mode: "guided" | "freeform";
  agentName?: string;
  createdAt?: string;
  traceId?: string;
  traffic?: TuiPlanningTrafficEntry[];
}

export interface TuiPlanningState {
  activeSessions: TuiPlanningSession[];
  recentSessions: TuiPlanningSession[];
}

export interface PlanningScreenOptions {
  projectId?: string;
  /** Project / branch label rendered in the workbench scope chrome. */
  projectLabel?: string;
  /** Active trace id rendered in the workbench footer. */
  traceId?: string | null;
  /** Healthy/total MCP servers rendered in the workbench footer. */
  mcp?: string | null;
  caller: {
    planning: {
      getState: (input?: { projectId?: string }) => Promise<TuiPlanningState>;
      startGuided: (input: {
        projectId?: string;
        agentName?: string;
        userPrompt?: string;
      }) => Promise<TuiPlanningSession>;
      startFreeform: (input: {
        projectId?: string;
        userPrompt?: string;
      }) => Promise<TuiPlanningSession>;
    };
  };
  onOpenSession?: (id: string) => void;
  viewportRows?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PlanningScreen
// ─────────────────────────────────────────────────────────────────────────────

export class PlanningScreen {
  private state: TuiPlanningState | null = null;
  private cursor = 0;
  private scrollTop = 0;
  private error: string | null = null;

  constructor(private readonly opts: PlanningScreenOptions) {}

  /** The OD stage-scope chrome for the Plan workbench. */
  private get scope(): StageWorkbenchScope {
    return {
      stage: "Plan",
      route: ":plan",
      purpose: "live planning",
      project: this.opts.projectLabel ?? this.opts.projectId ?? null,
      detail: `${this.allSessions.length} sessions`,
      agent: this.allSessions[this.cursor]?.agentName ?? null,
      mcp: this.opts.mcp ?? null,
      traceId: this.opts.traceId ?? this.allSessions[this.cursor]?.traceId ?? null,
    };
  }

  async load(): Promise<void> {
    try {
      this.state = await this.opts.caller.planning.getState(
        this.opts.projectId ? { projectId: this.opts.projectId } : undefined,
      );
      this.error = null;
      this.clampCursor();
    } catch (err) {
      this.state = null;
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  render(renderer: Renderer): void {
    renderStageWorkbenchHeader(renderer, this.scope);

    if (this.error) {
      renderWorkbenchErrorFrame(renderer, {
        what: "Planning state failed to load.",
        next: this.error,
        traceId: this.opts.traceId,
      });
      renderStageWorkbenchFooter(renderer, this.scope);
      return;
    }

    if (!this.state) {
      renderer.writeln();
      renderer.writeln(c.dim("  Loading planning state..."));
      renderStageWorkbenchFooter(renderer, this.scope);
      return;
    }

    if (this.allSessions.length === 0) {
      renderWorkbenchEmptyState(
        renderer,
        "No planning sessions in this stage yet.",
        "Press G for a guided session or F for freeform.",
      );
      renderer.writeln();
      renderer.writeln(c.dim("  G=guided start  F=freeform start  R=refresh  q=back"));
      renderStageWorkbenchFooter(renderer, this.scope);
      return;
    }

    // Active sessions
    const active = this.state.activeSessions;
    renderer.writeln(c.bold(`  Active sessions (${active.length})`));
    if (active.length === 0) {
      renderer.writeln(c.dim("  No active planning sessions."));
    } else {
      for (const session of active) {
        const badge = planningStatusBadge(session.status);
        const mode = session.mode === "guided" ? c.cyan("[guided]") : c.magenta("[freeform]");
        const agent = session.agentName ? c.dim(` @${session.agentName}`) : "";
        const traffic = session.traffic?.length
          ? c.dim(` ${session.traffic.length} events`)
          : "";
        renderer.writeln(`  ${badge} ${mode} ${session.title}${agent}${traffic}`);
      }
    }

    renderer.writeln();

    // Recent/all sessions list
    const allSessions = this.allSessions;
    renderer.writeln(c.bold(`  Sessions (${allSessions.length})`));
    if (allSessions.length === 0) {
      renderer.writeln(c.dim("  No planning sessions."));
    } else {
      const visible = this.visibleSessions;
      for (const session of visible) {
        const index = allSessions.indexOf(session);
        const pointer = index === this.cursor ? c.bold(">") : " ";
        const badge = planningStatusBadge(session.status);
        const mode = session.mode === "guided" ? c.cyan("[G]") : c.magenta("[F]");
        const date = session.createdAt ? c.dim(` ${session.createdAt}`) : "";
        renderer.writeln(`${pointer} ${badge} ${mode} ${session.title}${date}  ${c.dim(session.id)}`);
      }
    }

    // Traffic for selected session
    const selected = allSessions[this.cursor];
    if (selected?.traffic && selected.traffic.length > 0) {
      renderer.writeln();
      renderer.writeln(c.bold(`  Traffic (${selected.traffic.length})`));
      for (const entry of selected.traffic.slice(-8)) {
        const ts = entry.timestamp ? c.dim(` ${entry.timestamp}`) : "";
        renderer.writeln(`  ${entry.method}${ts}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  G=guided start  F=freeform start  R=refresh  j/k=navigate  Enter=open  q=back"));
    renderStageWorkbenchFooter(renderer, this.scope);
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      const max = Math.max(0, this.allSessions.length - 1);
      this.cursor = Math.min(this.cursor + 1, max);
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

    if (key === "G" || key === "g") {
      await this.startGuided();
      return true;
    }

    if (key === "F" || key === "f") {
      await this.startFreeform();
      return true;
    }

    if (key === "\r" || key === "\n") {
      const session = this.allSessions[this.cursor];
      if (!session) return false;
      this.opts.onOpenSession?.(session.id);
      return true;
    }

    return false;
  }

  private async startGuided(): Promise<void> {
    try {
      const session = await this.opts.caller.planning.startGuided({
        projectId: this.opts.projectId,
      });
      this.prependSession(session);
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private async startFreeform(): Promise<void> {
    try {
      const session = await this.opts.caller.planning.startFreeform({
        projectId: this.opts.projectId,
      });
      this.prependSession(session);
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private prependSession(session: TuiPlanningSession): void {
    if (!this.state) {
      this.state = { activeSessions: [session], recentSessions: [] };
    } else {
      this.state = {
        activeSessions: [session, ...this.state.activeSessions],
        recentSessions: this.state.recentSessions,
      };
    }
    this.cursor = 0;
    this.scrollTop = 0;
  }

  get allSessions(): readonly TuiPlanningSession[] {
    if (!this.state) return [];
    return [...this.state.activeSessions, ...this.state.recentSessions];
  }

  get visibleSessions(): readonly TuiPlanningSession[] {
    const rows = this.opts.viewportRows ?? 20;
    const all = this.allSessions;
    return all.slice(this.scrollTop, this.scrollTop + rows);
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.allSessions.length - 1));
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

function planningStatusBadge(status: string): string {
  if (status === "idle") return c.dim("[idle]");
  if (status === "planning") return c.yellow("[planning]");
  if (status === "awaiting_review") return c.cyan("[review]");
  if (status === "approved") return c.green("[approved]");
  if (status === "rejected") return c.red("[rejected]");
  if (status === "executing") return c.yellow("[executing]");
  return `[${status}]`;
}

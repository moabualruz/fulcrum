/**
 * PlanReviewScreen — TUI workflow review surface.
 *
 * Shows docs, planning, execution, review, UAT, and E2E state in one
 * keyboard-navigable workflow with trace/run/task identifiers visible.
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export type TuiWorkflowStageId = "docs" | "planning" | "execution" | "review" | "uat" | "e2e";

export type TuiWorkflowStageStatus =
  | "ready"
  | "in_progress"
  | "waiting"
  | "blocked"
  | "passed"
  | "failed"
  | "unavailable";

export interface TuiWorkflowStageIds {
  traceId?: string;
  runId?: string;
  taskId?: string;
  reviewId?: string;
}

export interface TuiWorkflowStage {
  id: TuiWorkflowStageId | string;
  label: string;
  status: TuiWorkflowStageStatus | string;
  summary: string;
  actionLabel: string;
  screen?: string;
  ids?: TuiWorkflowStageIds;
  unavailableReason?: string;
}

export interface TuiPlanReviewState {
  projectId: string;
  planId: string;
  traceId: string;
  stages: TuiWorkflowStage[];
}

export interface PlanReviewScreenOptions {
  projectId?: string;
  planId?: string;
  traceId?: string;
  state?: TuiPlanReviewState;
  caller?: {
    workflow?: {
      getPlanReviewState?: (input: {
        projectId?: string;
        planId?: string;
        traceId?: string;
      }) => Promise<TuiPlanReviewState>;
    };
  };
  onOpenStage?: (stage: TuiWorkflowStage) => void;
  viewportRows?: number;
}

export class PlanReviewScreen {
  private state: TuiPlanReviewState | null = null;
  private cursor = 0;
  private scrollTop = 0;
  private feedback: string | null = null;

  constructor(private readonly opts: PlanReviewScreenOptions = {}) {}

  async load(): Promise<void> {
    const loader = this.opts.caller?.workflow?.getPlanReviewState;
    this.state = loader
      ? await loader({
          projectId: this.opts.projectId,
          planId: this.opts.planId,
          traceId: this.opts.traceId,
        })
      : (this.opts.state ?? defaultPlanReviewState(this.opts));
    this.feedback = null;
    this.clampCursor();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Plan Review Workflow"));
    renderer.separator();
    renderer.writeln();

    if (!this.state) {
      renderer.writeln(c.dim("  Loading workflow state..."));
      renderer.writeln();
      renderer.writeln(c.dim("  R=refresh  q=back"));
      return;
    }

    renderer.infoRow("Project", this.state.projectId);
    renderer.infoRow("Plan", this.state.planId);
    renderer.infoRow("Trace", this.state.traceId);

    if (this.feedback) {
      renderer.writeln();
      renderer.writeln(c.yellow(`  ${this.feedback}`));
    }

    renderer.writeln();
    renderer.writeln(c.bold("  Workflow stages"));

    for (const stage of this.visibleStages) {
      const index = this.stages.indexOf(stage);
      const pointer = index === this.cursor ? c.bold(">") : " ";
      const screen = stage.screen ? c.dim(` ${stage.screen}`) : "";
      renderer.writeln(`${pointer} ${statusBadge(stage.status)} ${stage.label}${screen}`);
      renderer.writeln(`    ${stage.summary}`);

      const ids = stageIds(stage, this.state.traceId);
      if (ids.length > 0) renderer.writeln(c.dim(`    ${ids.join("  ")}`));
      if (stage.unavailableReason) {
        renderer.writeln(c.yellow(`    Unavailable: ${stage.unavailableReason}`));
      } else {
        renderer.writeln(c.dim(`    Enter: ${stage.actionLabel}`));
      }
    }

    const selected = this.stages[this.cursor];
    if (selected) {
      renderer.writeln();
      renderer.writeln(c.bold("  Selected action"));
      renderer.infoRow("Stage", selected.label);
      renderer.infoRow("Action", selected.actionLabel);
      if (selected.unavailableReason) renderer.infoRow("Unavailable", selected.unavailableReason);
    }

    renderer.writeln();
    renderer.writeln(c.dim("  j/k=navigate  Enter=open  R=refresh  q=back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.stages.length - 1));
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

    if (key === "\r" || key === "\n") {
      const stage = this.stages[this.cursor];
      if (!stage) return false;
      if (stage.unavailableReason) {
        this.feedback = `Unavailable: ${stage.unavailableReason}`;
        return true;
      }
      this.feedback = `Opening ${stage.label}: ${stage.actionLabel}`;
      this.opts.onOpenStage?.(stage);
      return true;
    }

    return false;
  }

  get stages(): readonly TuiWorkflowStage[] {
    return this.state?.stages ?? [];
  }

  get visibleStages(): readonly TuiWorkflowStage[] {
    const rows = this.opts.viewportRows ?? 12;
    return this.stages.slice(this.scrollTop, this.scrollTop + rows);
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.stages.length - 1));
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 12;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }
}

function statusBadge(status: string): string {
  if (status === "ready") return c.cyan("[ready]");
  if (status === "in_progress") return c.yellow("[running]");
  if (status === "waiting") return c.yellow("[waiting]");
  if (status === "blocked") return c.red("[blocked]");
  if (status === "passed") return c.green("[passed]");
  if (status === "failed") return c.red("[failed]");
  if (status === "unavailable") return c.dim("[n/a]");
  return `[${status}]`;
}

function stageIds(stage: TuiWorkflowStage, fallbackTraceId: string): string[] {
  const ids = stage.ids ?? {};
  return [
    `trace:${ids.traceId ?? fallbackTraceId}`,
    ids.runId ? `run:${ids.runId}` : null,
    ids.taskId ? `task:${ids.taskId}` : null,
    ids.reviewId ? `review:${ids.reviewId}` : null,
  ].filter((id): id is string => id !== null);
}

function defaultPlanReviewState(opts: PlanReviewScreenOptions): TuiPlanReviewState {
  const projectId = opts.projectId ?? "project-local";
  const planId = opts.planId ?? "plan-review";
  const traceId = opts.traceId ?? "trace-plan-review";

  return {
    projectId,
    planId,
    traceId,
    stages: [
      {
        id: "docs",
        label: "Docs",
        status: "ready",
        summary: "Open source docs, notes, and acceptance criteria before planning.",
        actionLabel: "open docs tree",
        screen: "docs",
        ids: { traceId, taskId: "task-docs-review" },
      },
      {
        id: "planning",
        label: "Planning",
        status: "in_progress",
        summary: "Start or resume guided planning with visible planning session state.",
        actionLabel: "open planning",
        screen: "planning",
        ids: { traceId, runId: "run-planning", taskId: "task-planning" },
      },
      {
        id: "execution",
        label: "Execution",
        status: "waiting",
        summary: "Inspect run queue, active agent run, and task handoff before changes.",
        actionLabel: "open runs",
        screen: "runs",
        ids: { traceId, runId: "run-execution", taskId: "task-execution" },
      },
      {
        id: "review",
        label: "Review",
        status: "ready",
        summary: "Open code review and evidence status for the same trace.",
        actionLabel: "open review",
        screen: "review",
        ids: { traceId, runId: "run-review", reviewId: "review-code" },
      },
      {
        id: "uat",
        label: "UAT",
        status: "unavailable",
        summary: "Manual acceptance waits until generated review evidence passes.",
        actionLabel: "open UAT",
        screen: "review-handoff",
        ids: { traceId, reviewId: "review-uat" },
        unavailableReason: "UAT unlocks after review evidence is ready.",
      },
      {
        id: "e2e",
        label: "E2E",
        status: "unavailable",
        summary: "Generated regression test status appears after UAT approval.",
        actionLabel: "open E2E report",
        screen: "reports",
        ids: { traceId, runId: "run-e2e" },
        unavailableReason: "E2E report unlocks after UAT approval.",
      },
    ],
  };
}

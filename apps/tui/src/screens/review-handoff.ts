import type { Renderer } from "../renderer.ts";
import { c, truncate } from "../renderer.ts";

export type UatCodeReviewDecision = "start_uat" | "start_code_review" | "request_changes" | "approve_without_manual_review";
export type UatCodeReviewType = "uat" | "code_review";

export interface TuiReviewHandoffSession {
  id: string;
  type?: string;
  status?: string;
  title?: string;
}

export interface TuiGeneratedE2eTest {
  filename?: string;
  runner?: string;
  storePath?: string;
  bodyPath?: string;
  coverageCases?: Array<{ id?: string; criterion?: string }>;
}

export interface TuiReviewHandoff {
  projectId?: string;
  traceId?: string;
  status?: string;
  finalQaStatus?: string;
  nextAction?: string;
  promptMarkdown?: string;
  reviewSessions?: TuiReviewHandoffSession[];
  decisionOptions?: Array<{ id: string; label?: string }>;
}

export interface TuiReviewDecisionResult {
  projectId?: string;
  traceId?: string;
  decision?: UatCodeReviewDecision;
  reviewType?: UatCodeReviewType;
  status?: string;
  nextAction?: string;
  generatedE2eTests?: TuiGeneratedE2eTest[];
}

export interface TuiGeneratedE2eRun {
  projectId?: string;
  traceId?: string;
  runner?: string;
  status?: string;
  command?: string[];
  cwd?: string;
  testFiles?: string[];
  artifactIds?: string[];
}

export interface ReviewHandoffScreenOptions {
  projectId: string;
  traceId?: string;
  runner?: "bun" | "playwright";
  caller: {
    reports: {
      uatCodeReviewHandoff: (input: { projectId: string; traceId?: string }) => Promise<TuiReviewHandoff>;
      recordUatCodeReviewDecision: (input: {
        projectId: string;
        traceId?: string;
        decision: UatCodeReviewDecision;
        reviewType: UatCodeReviewType;
        feedback?: string;
        e2eRunner?: string;
      }) => Promise<TuiReviewDecisionResult>;
      runGeneratedE2eRegressionTests: (input: {
        projectId: string;
        traceId?: string;
        runner?: string;
        planOnly?: boolean;
      }) => Promise<TuiGeneratedE2eRun>;
    };
  };
}

export class ReviewHandoffScreen {
  private handoff: TuiReviewHandoff | null = null;
  private decision: TuiReviewDecisionResult | null = null;
  private e2eRun: TuiGeneratedE2eRun | null = null;
  private error: string | null = null;

  constructor(private readonly opts: ReviewHandoffScreenOptions) {}

  async load(): Promise<void> {
    try {
      this.handoff = await this.opts.caller.reports.uatCodeReviewHandoff({
        projectId: this.opts.projectId,
        traceId: this.opts.traceId,
      });
      this.error = null;
    } catch (err) {
      this.handoff = null;
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  UAT and Code Review Handoff"));
    renderer.separator();
    renderer.writeln();

    if (this.error) {
      renderer.writeln(c.red(`  ${this.error}`));
      renderer.writeln();
    }

    const traceId = this.decision?.traceId ?? this.handoff?.traceId ?? this.opts.traceId ?? "(none)";
    renderer.infoRow("Project", this.handoff?.projectId ?? this.opts.projectId);
    renderer.infoRow("Trace", traceId);
    renderer.infoRow("Final QA", this.handoff?.finalQaStatus ?? "(unknown)");
    renderer.infoRow("Gate status", this.decision?.status ?? this.handoff?.status ?? "(not loaded)");
    renderer.infoRow("Next action", this.decision?.nextAction ?? this.handoff?.nextAction ?? "(none)");
    renderer.writeln();

    renderer.writeln(c.bold("  Final gate prompt"));
    renderer.writeln(`  ${truncate(this.promptText, Math.max(24, renderer.width - 4))}`);
    renderer.writeln();

    renderer.writeln(c.bold("  Review sessions"));
    const sessions = this.handoff?.reviewSessions ?? [];
    if (sessions.length === 0) {
      renderer.writeln(c.dim("  No pending review sessions."));
    } else {
      for (const session of sessions) {
        renderer.writeln(`  ${sessionBadge(session.status)} ${session.type ?? "review"} ${session.id}${session.title ? c.dim(` ${session.title}`) : ""}`);
      }
    }
    renderer.writeln();

    renderer.writeln(c.bold("  Decision controls"));
    renderer.writeln("  A approve without manual review  X request changes  U start UAT  C start code review  E plan generated E2E");
    renderer.writeln();

    renderer.writeln(c.bold("  Generated E2E artifacts"));
    const tests = this.generatedTests;
    if (tests.length === 0 && !this.e2eRun) {
      renderer.writeln(c.dim("  No generated E2E artifact linked yet."));
    }
    for (const test of tests) {
      const path = test.bodyPath ?? test.storePath ?? test.filename ?? "(unknown)";
      renderer.writeln(`  ${test.runner ?? this.opts.runner ?? "runner"} ${path}`);
      for (const coverage of test.coverageCases ?? []) {
        renderer.writeln(c.dim(`    - ${coverage.criterion ?? coverage.id ?? "coverage case"}`));
      }
    }
    for (const file of this.e2eRun?.testFiles ?? []) {
      renderer.writeln(`  ${this.e2eRun?.runner ?? this.opts.runner ?? "runner"} ${file}`);
    }
    if (this.e2eRun?.command?.length) {
      renderer.writeln(c.dim(`  command: ${this.e2eRun.command.join(" ")}`));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "A" || key === "a") {
      await this.recordDecision("approve_without_manual_review", "uat", "Approved from TUI final gate.");
      return true;
    }
    if (key === "X" || key === "x") {
      await this.recordDecision("request_changes", "code_review", "Changes requested from TUI final gate.");
      return true;
    }
    if (key === "U" || key === "u") {
      await this.recordDecision("start_uat", "uat");
      return true;
    }
    if (key === "C" || key === "c") {
      await this.recordDecision("start_code_review", "code_review");
      return true;
    }
    if (key === "E" || key === "e") {
      await this.planGeneratedE2e();
      return true;
    }
    return false;
  }

  private get promptText(): string {
    return this.handoff?.promptMarkdown?.replace(/\s+/g, " ").trim()
      || "Review QA evidence, inspect changed files, approve only when acceptance and generated E2E coverage are trace-linked, or request changes with blocking feedback.";
  }

  private get generatedTests(): readonly TuiGeneratedE2eTest[] {
    return this.decision?.generatedE2eTests ?? [];
  }

  private async recordDecision(decision: UatCodeReviewDecision, reviewType: UatCodeReviewType, feedback?: string): Promise<void> {
    try {
      this.decision = await this.opts.caller.reports.recordUatCodeReviewDecision({
        projectId: this.opts.projectId,
        traceId: this.handoff?.traceId ?? this.opts.traceId,
        decision,
        reviewType,
        feedback,
        e2eRunner: this.opts.runner ?? "playwright",
      });
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private async planGeneratedE2e(): Promise<void> {
    try {
      this.e2eRun = await this.opts.caller.reports.runGeneratedE2eRegressionTests({
        projectId: this.opts.projectId,
        traceId: this.decision?.traceId ?? this.handoff?.traceId ?? this.opts.traceId,
        runner: this.opts.runner ?? "playwright",
        planOnly: true,
      });
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }
}

function sessionBadge(status?: string): string {
  if (status === "approved") return c.green("[approved]");
  if (status === "changes_requested") return c.red("[changes]");
  if (status === "pending_user_decision") return c.yellow("[awaiting]");
  if (status === "ready") return c.green("[ready]");
  return c.dim(`[${status ?? "unknown"}]`);
}

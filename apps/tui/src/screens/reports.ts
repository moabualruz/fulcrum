import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

interface Metrics {
  burndown: Array<{ day: number; ideal: number; actual: number }>;
  velocity: Array<{ sprint: string; points: number }>;
  cycleTime: number[];
  throughput: number[];
  wip: Record<string, number>;
  cfd: Array<Record<string, number | string>>;
}

interface FinalQaReport {
  projectId: string;
  traceId?: string;
  status: "passed" | "failed";
  readyForUserAcceptance: boolean;
  nextAction: string;
  summary: {
    taskCount: number;
    docCount: number;
    runCount: number;
    artifactCount: number;
    successCriteriaCount: number;
    approvedTaskCount: number;
    blockedTaskCount: number;
    openFeedbackRunCount: number;
  };
  checks: Array<{ id: string; label: string; status: "pass" | "fail" | "warn"; details: string }>;
}

interface FinalQaFeedbackGate {
  projectId: string;
  traceId?: string;
  loopAttempted: boolean;
  readyForUserAcceptance: boolean;
  nextAction: string;
  feedbackLoop: {
    iterations?: number;
    exhausted: boolean;
    stopReason: string;
  } | null;
  finalQa: Pick<FinalQaReport, "status" | "nextAction" | "readyForUserAcceptance" | "summary">;
}

interface UatCodeReviewHandoff {
  projectId: string;
  traceId?: string;
  status: "ready" | "blocked";
  finalQaStatus: "passed" | "failed";
  nextAction: string;
  reviewSessions: Array<{ id: string; type: "uat" | "code_review"; status: string }>;
  decisionOptions: Array<{ id: string; label?: string; description?: string }>;
  promptMarkdown: string;
}

interface UatCodeReviewDecision {
  projectId: string;
  traceId?: string;
  decision: string;
  reviewType: "uat" | "code_review";
  status: string;
  nextAction: string;
  feedbackRuns: Array<{ id: string; taskId: string; agent: string; status: string }>;
  generatedE2eTests: Array<{
    artifactId: string;
    filename: string;
    path: string;
    runner?: "bun" | "playwright";
    storePath: string;
    bodyPath: string;
    coverageCases?: Array<{ id: string; criterion: string }>;
  }>;
}

interface GeneratedE2eRun {
  projectId: string;
  traceId?: string;
  runner?: "bun" | "playwright";
  status: "passed" | "failed" | "planned";
  command: string[];
  cwd?: string;
  testFiles: string[];
  artifactIds: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  ciCommand?: string[];
  ciEnv?: Record<string, string>;
}

interface ConfiguredAutoDecision {
  projectId: string;
  traceId?: string;
  settingKey: string;
  status: "not_configured" | "disabled" | "applied" | "blocked";
  nextAction: string;
  config: {
    enabled: boolean;
    decision: string;
    reviewType: "uat" | "code_review";
  } | null;
  decision: {
    status?: string;
    generatedE2eTests?: UatCodeReviewDecision["generatedE2eTests"];
  } | null;
}

interface ReviewWorkbenchReport {
  projectId?: string;
  traceId?: string;
  reviewId?: string;
  summary: {
    fileCount: number;
    visibleFileCount: number;
    viewedFileCount: number;
    annotationCount: number;
    blockingAnnotationCount: number;
    suggestionCount: number;
    searchMatchCount: number;
    hasLiveOutput: boolean;
  };
  visibleFiles?: Array<{ path: string; annotationCount?: number; searchMatchCount?: number; viewed?: boolean }>;
  annotationGroups?: Array<{ filePath: string; blockingCount?: number; suggestionCount?: number; annotations?: unknown[] }>;
  search?: { query?: string; groups?: Array<{ filePath: string; matches?: unknown[] }> };
  suggestions?: Array<{ annotationId?: string; filePath?: string; lineStart?: number; lineEnd?: number; canApply?: boolean }>;
  submission?: { targets?: unknown[]; orphans?: unknown[] };
  liveLog?: { displayText?: string; truncated?: boolean; isWaiting?: boolean };
}

interface ReviewWorkbenchSessionReport {
  projectId: string;
  traceId?: string;
  reviewId: string;
  reviewType: "plan" | "uat" | "code_review";
  title?: string;
  status: "saved" | "loaded" | "annotated";
  revision: number;
  eventId: string;
  model: ReviewWorkbenchReport;
}

type ReportKey =
  | "burndown"
  | "velocity"
  | "cycle"
  | "throughput"
  | "wip"
  | "cfd"
  | "finalQa"
  | "finalQaGate"
  | "uatHandoff"
  | "uatDecision"
  | "autoDecision"
  | "e2eRun"
  | "reviewWorkbench"
  | "reviewSession";

const REPORT_KEYS: Record<string, ReportKey> = {
  "0": "e2eRun",
  "1": "burndown",
  "2": "velocity",
  "3": "cycle",
  "4": "throughput",
  "5": "wip",
  "6": "cfd",
  "7": "finalQa",
  "g": "finalQaGate",
  "8": "uatHandoff",
  "9": "uatDecision",
  "a": "autoDecision",
  "r": "reviewWorkbench",
  "s": "reviewSession",
};

export class ReportsScreen {
  private metrics: Metrics | null = null;
  private finalQa: FinalQaReport | null = null;
  private finalQaGate: FinalQaFeedbackGate | null = null;
  private uatHandoff: UatCodeReviewHandoff | null = null;
  private uatDecision: UatCodeReviewDecision | null = null;
  private autoDecision: ConfiguredAutoDecision | null = null;
  private e2eRun: GeneratedE2eRun | null = null;
  private reviewWorkbench: ReviewWorkbenchReport | null = null;
  private reviewSession: ReviewWorkbenchSessionReport | null = null;
  private selected: ReportKey = "burndown";

  constructor(
    private readonly opts: {
      finalQaInput?: { projectId: string; traceId?: string };
      finalQaGateInput?: {
        projectId: string;
        traceId?: string;
        workerId?: string;
        reviewerAgent?: string;
        feedbackAgent?: string;
        feedbackModel?: string;
        maxIterations?: number;
        cwd?: string;
        copyToWorktree?: string[];
      };
      uatHandoffInput?: { projectId: string; traceId?: string };
      autoDecisionInput?: { projectId: string; traceId?: string; taskIds?: string[] };
      e2eRunInput?: { projectId: string; traceId?: string; runner?: "bun" | "playwright"; planOnly?: boolean };
      reviewWorkbenchInput?: Record<string, unknown>;
      reviewSessionInput?: Record<string, unknown>;
      reviewAnnotationInput?: Record<string, unknown>;
      uatDecisionInput?: {
        projectId: string;
        traceId?: string;
        decision: string;
        reviewType: "uat" | "code_review";
        feedbackText?: string;
      };
      caller: {
        reports: {
          metrics: () => Promise<Metrics>;
          finalQa?: (input: { projectId: string; traceId?: string }) => Promise<FinalQaReport>;
          finalQaFeedbackGate?: (input: NonNullable<ReportsScreen["opts"]["finalQaGateInput"]>) => Promise<FinalQaFeedbackGate>;
          uatCodeReviewHandoff?: (input: { projectId: string; traceId?: string }) => Promise<UatCodeReviewHandoff>;
          applyConfiguredUatCodeReviewDecision?: (input: { projectId: string; traceId?: string; taskIds?: string[] }) => Promise<ConfiguredAutoDecision>;
          reviewWorkbench?: (input: Record<string, unknown>) => Promise<ReviewWorkbenchReport>;
          loadReviewWorkbenchSession?: (input: Record<string, unknown>) => Promise<ReviewWorkbenchSessionReport>;
          appendReviewWorkbenchAnnotation?: (input: Record<string, unknown>) => Promise<ReviewWorkbenchSessionReport>;
          recordUatCodeReviewDecision?: (input: {
            projectId: string;
            traceId?: string;
            decision: string;
            reviewType: "uat" | "code_review";
            feedbackText?: string;
          }) => Promise<UatCodeReviewDecision>;
          runGeneratedE2eRegressionTests?: (input: { projectId: string; traceId?: string; runner?: "bun" | "playwright"; planOnly?: boolean }) => Promise<GeneratedE2eRun>;
        };
      };
    },
  ) {}

  async load(): Promise<void> {
    this.metrics = await this.opts.caller.reports.metrics();
    if (this.opts.caller.reports.finalQa && this.opts.finalQaInput) {
      this.finalQa = await this.opts.caller.reports.finalQa(this.opts.finalQaInput);
    }
    if (this.opts.caller.reports.finalQaFeedbackGate && this.opts.finalQaGateInput) {
      this.finalQaGate = await this.opts.caller.reports.finalQaFeedbackGate(this.opts.finalQaGateInput);
    }
    if (this.opts.caller.reports.uatCodeReviewHandoff && this.opts.uatHandoffInput) {
      this.uatHandoff = await this.opts.caller.reports.uatCodeReviewHandoff(this.opts.uatHandoffInput);
    }
    if (this.opts.caller.reports.recordUatCodeReviewDecision && this.opts.uatDecisionInput) {
      this.uatDecision = await this.opts.caller.reports.recordUatCodeReviewDecision(this.opts.uatDecisionInput);
    }
    if (this.opts.caller.reports.applyConfiguredUatCodeReviewDecision && this.opts.autoDecisionInput) {
      this.autoDecision = await this.opts.caller.reports.applyConfiguredUatCodeReviewDecision(this.opts.autoDecisionInput);
    }
    if (this.opts.caller.reports.runGeneratedE2eRegressionTests && this.opts.e2eRunInput) {
      this.e2eRun = await this.opts.caller.reports.runGeneratedE2eRegressionTests(this.opts.e2eRunInput);
    }
    if (this.opts.caller.reports.reviewWorkbench && this.opts.reviewWorkbenchInput) {
      this.reviewWorkbench = await this.opts.caller.reports.reviewWorkbench(this.opts.reviewWorkbenchInput);
    }
    if (this.opts.caller.reports.loadReviewWorkbenchSession && this.opts.reviewSessionInput) {
      this.reviewSession = await this.opts.caller.reports.loadReviewWorkbenchSession(this.opts.reviewSessionInput);
    }
    if (this.opts.caller.reports.appendReviewWorkbenchAnnotation && this.opts.reviewAnnotationInput) {
      this.reviewSession = await this.opts.caller.reports.appendReviewWorkbenchAnnotation(this.opts.reviewAnnotationInput);
    }
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Reports"));
    renderer.separator();
    renderer.writeln(c.dim("  1 Burndown  2 Velocity  3 Cycle-time  4 Throughput  5 WIP  6 CFD  7 Final QA  G Gate  8 UAT  9 Decision  A Auto  0 E2E  R Review  S Session"));
    renderer.writeln();

    if (!this.metrics) {
      renderer.writeln(c.dim("  Loading metrics."));
      return;
    }

    if (this.selected === "burndown") renderBurndown(renderer, this.metrics.burndown);
    if (this.selected === "velocity") renderVelocity(renderer, this.metrics.velocity);
    if (this.selected === "cycle") renderCycleTime(renderer, this.metrics.cycleTime);
    if (this.selected === "throughput") renderThroughput(renderer, this.metrics.throughput);
    if (this.selected === "wip") renderWip(renderer, this.metrics.wip);
    if (this.selected === "cfd") renderCfd(renderer, this.metrics.cfd);
    if (this.selected === "finalQa") renderFinalQa(renderer, this.finalQa);
    if (this.selected === "finalQaGate") renderFinalQaGate(renderer, this.finalQaGate);
    if (this.selected === "uatHandoff") renderUatHandoff(renderer, this.uatHandoff);
    if (this.selected === "uatDecision") renderUatDecision(renderer, this.uatDecision);
    if (this.selected === "autoDecision") renderAutoDecision(renderer, this.autoDecision);
    if (this.selected === "e2eRun") renderGeneratedE2eRun(renderer, this.e2eRun);
    if (this.selected === "reviewWorkbench") renderReviewWorkbench(renderer, this.reviewWorkbench);
    if (this.selected === "reviewSession") renderReviewSession(renderer, this.reviewSession);
  }

  async handleKey(key: string): Promise<boolean> {
    const report = REPORT_KEYS[key.toLowerCase()];
    if (!report) return false;
    this.selected = report;
    return true;
  }
}

function renderBurndown(renderer: Renderer, rows: Metrics["burndown"]): void {
  renderer.writeln(c.bold("  Burndown"));
  renderer.writeln("  ideal | actual");
  for (const row of rows) {
    renderer.writeln(`  day ${row.day} | ${bar(row.ideal)} ${row.ideal} | ${bar(row.actual)} ${row.actual}`);
  }
}

function renderVelocity(renderer: Renderer, rows: Metrics["velocity"]): void {
  renderer.writeln(c.bold("  Velocity"));
  for (const row of rows.slice(-3)) {
    renderer.writeln(`  ${row.sprint} | ${bar(row.points)} ${row.points}`);
  }
}

function renderCycleTime(renderer: Renderer, values: number[]): void {
  renderer.writeln(c.bold("  Cycle-time"));
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) / 2)]!;
  renderer.writeln(`  median: ${median}`);
  for (const value of sorted) renderer.writeln(`  ${value}d | ${bar(value)}`);
}

function renderThroughput(renderer: Renderer, values: number[]): void {
  renderer.writeln(c.bold("  Throughput"));
  renderer.writeln(`  ${sparkline(values)}  ${values.join(" ")}`);
}

function renderWip(renderer: Renderer, values: Record<string, number>): void {
  renderer.writeln(c.bold("  WIP"));
  for (const [key, value] of Object.entries(values)) {
    renderer.writeln(`  ${key}: ${value}`);
  }
}

function renderCfd(renderer: Renderer, rows: Metrics["cfd"]): void {
  renderer.writeln(c.bold("  CFD"));
  for (const row of rows) {
    const label = String(row["day"] ?? "");
    const segments = Object.entries(row)
      .filter(([key]) => key !== "day")
      .map(([key, value]) => `${key[0]!.toUpperCase().repeat(Number(value) + (key === "done" ? 1 : 0))}`)
      .join("");
    renderer.writeln(`  ${label} | ${segments.replace(/(T+)(I+)(D+)/, "$1 $2$3")}`);
  }
}

function renderFinalQa(renderer: Renderer, report: FinalQaReport | null): void {
  renderer.writeln(c.bold("  Final QA"));
  if (!report) {
    renderer.writeln(c.dim("  No final QA report loaded."));
    return;
  }
  renderer.writeln(`  status: ${report.status}`);
  renderer.writeln(`  next: ${report.nextAction}`);
  renderer.writeln(`  trace: ${report.traceId ?? "none"}`);
  renderer.writeln(
    `  tasks: ${report.summary.taskCount} docs: ${report.summary.docCount} runs: ${report.summary.runCount} artifacts: ${report.summary.artifactCount}`,
  );
  renderer.writeln(
    `  criteria: ${report.summary.successCriteriaCount} approved: ${report.summary.approvedTaskCount} open feedback: ${report.summary.openFeedbackRunCount}`,
  );
  for (const check of report.checks) {
    renderer.writeln(`  ${check.id} [${check.status}] ${check.details}`);
  }
}

function renderFinalQaGate(renderer: Renderer, gate: FinalQaFeedbackGate | null): void {
  renderer.writeln(c.bold("  Final QA Gate"));
  if (!gate) {
    renderer.writeln(c.dim("  No final QA feedback gate result loaded."));
    return;
  }
  renderer.writeln(`  final: ${gate.finalQa.status}`);
  renderer.writeln(`  next: ${gate.nextAction}`);
  renderer.writeln(`  trace: ${gate.traceId ?? "none"}`);
  renderer.writeln(`  ready: ${gate.readyForUserAcceptance ? "yes" : "no"}`);
  renderer.writeln(`  loop: ${gate.loopAttempted ? "attempted" : "skipped"}`);
  if (gate.feedbackLoop) {
    renderer.writeln(`  stop: ${gate.feedbackLoop.stopReason}`);
    renderer.writeln(`  exhausted: ${gate.feedbackLoop.exhausted ? "yes" : "no"}`);
    if (typeof gate.feedbackLoop.iterations === "number") renderer.writeln(`  iterations: ${gate.feedbackLoop.iterations}`);
  }
  renderer.writeln(`  open feedback: ${gate.finalQa.summary.openFeedbackRunCount}`);
}

function renderUatHandoff(renderer: Renderer, handoff: UatCodeReviewHandoff | null): void {
  renderer.writeln(c.bold("  UAT / Code Review"));
  if (!handoff) {
    renderer.writeln(c.dim("  No UAT/code review handoff loaded."));
    return;
  }
  renderer.writeln(`  status: ${handoff.status}`);
  renderer.writeln(`  final QA: ${handoff.finalQaStatus}`);
  renderer.writeln(`  next: ${handoff.nextAction}`);
  renderer.writeln(`  trace: ${handoff.traceId ?? "none"}`);
  renderer.writeln("  sessions:");
  for (const session of handoff.reviewSessions) {
    renderer.writeln(`  - ${session.id} [${session.type}] ${session.status}`);
  }
  renderer.writeln("  decisions:");
  for (const option of handoff.decisionOptions) {
    renderer.writeln(`  - ${option.id}${option.label ? `: ${option.label}` : ""}`);
  }
}

function renderUatDecision(renderer: Renderer, decision: UatCodeReviewDecision | null): void {
  renderer.writeln(c.bold("  UAT Decision"));
  if (!decision) {
    renderer.writeln(c.dim("  No UAT/code review decision loaded."));
    return;
  }
  renderer.writeln(`  status: ${decision.status}`);
  renderer.writeln(`  next: ${decision.nextAction}`);
  renderer.writeln(`  trace: ${decision.traceId ?? "none"}`);
  renderer.writeln(`  decision: ${decision.decision} [${decision.reviewType}]`);
  renderer.writeln("  generated E2E:");
  for (const test of decision.generatedE2eTests) {
    renderer.writeln(`  - ${test.filename} (${test.artifactId})`);
    renderer.writeln(`    runner: ${test.runner ?? "bun"}`);
    if (test.coverageCases) renderer.writeln(`    coverage: ${test.coverageCases.length} case(s)`);
    renderer.writeln(`    ${test.bodyPath}`);
  }
  renderer.writeln("  feedback runs:");
  for (const run of decision.feedbackRuns) {
    renderer.writeln(`  - ${run.id} ${run.agent} ${run.status}`);
  }
}

function renderAutoDecision(renderer: Renderer, autoDecision: ConfiguredAutoDecision | null): void {
  renderer.writeln(c.bold("  Auto Decision"));
  if (!autoDecision) {
    renderer.writeln(c.dim("  No configured auto-decision loaded."));
    return;
  }
  renderer.writeln(`  status: ${autoDecision.status}`);
  renderer.writeln(`  next: ${autoDecision.nextAction}`);
  renderer.writeln(`  trace: ${autoDecision.traceId ?? "none"}`);
  renderer.writeln(`  setting: ${autoDecision.settingKey}`);
  if (autoDecision.config) {
    renderer.writeln(`  decision: ${autoDecision.config.decision} [${autoDecision.config.reviewType}]`);
  }
  renderer.writeln(`  decision status: ${autoDecision.decision?.status ?? "none"}`);
  renderer.writeln("  generated E2E:");
  for (const test of autoDecision.decision?.generatedE2eTests ?? []) {
    renderer.writeln(`  - ${test.filename} (${test.artifactId})`);
    renderer.writeln(`    runner: ${test.runner ?? "bun"}`);
    if (test.coverageCases) renderer.writeln(`    coverage: ${test.coverageCases.length} case(s)`);
    renderer.writeln(`    ${test.bodyPath}`);
  }
}

function renderGeneratedE2eRun(renderer: Renderer, run: GeneratedE2eRun | null): void {
  renderer.writeln(c.bold("  Generated E2E Run"));
  if (!run) {
    renderer.writeln(c.dim("  No generated E2E run loaded."));
    return;
  }
  renderer.writeln(`  status: ${run.status}`);
  renderer.writeln(`  runner: ${run.runner ?? "bun"}`);
  renderer.writeln(`  exit: ${run.exitCode ?? "planned"}`);
  renderer.writeln(`  trace: ${run.traceId ?? "none"}`);
  renderer.writeln(`  command: ${run.command.join(" ")}`);
  if (run.cwd) renderer.writeln(`  cwd: ${run.cwd}`);
  if (run.ciCommand) renderer.writeln(`  ci: ${run.ciCommand.join(" ")}`);
  renderer.writeln("  test files:");
  for (const file of run.testFiles) renderer.writeln(`  - ${file}`);
}

function renderReviewWorkbench(renderer: Renderer, review: ReviewWorkbenchReport | null): void {
  renderer.writeln(c.bold("  Review Workbench"));
  if (!review) {
    renderer.writeln(c.dim("  No review workbench loaded."));
    return;
  }

  renderer.writeln(`  trace: ${review.traceId ?? "none"}`);
  if (review.reviewId) renderer.writeln(`  review: ${review.reviewId}`);
  renderer.writeln(
    `  files: ${review.summary.fileCount} visible: ${review.summary.visibleFileCount} viewed: ${review.summary.viewedFileCount}`,
  );
  renderer.writeln(
    `  annotations: ${review.summary.annotationCount} blocking: ${review.summary.blockingAnnotationCount} suggestions: ${review.summary.suggestionCount}`,
  );
  renderer.writeln(`  search: ${review.search?.query ?? ""} matches: ${review.summary.searchMatchCount}`);

  renderer.writeln("  files:");
  for (const file of review.visibleFiles ?? []) {
    renderer.writeln(
      `  - ${file.path} annotations: ${file.annotationCount ?? 0} matches: ${file.searchMatchCount ?? 0}`,
    );
  }

  renderer.writeln("  annotation groups:");
  for (const group of review.annotationGroups ?? []) {
    renderer.writeln(
      `  - ${group.filePath} blocking: ${group.blockingCount ?? 0} suggestions: ${group.suggestionCount ?? 0}`,
    );
  }

  renderer.writeln(`  targets: ${review.submission?.targets?.length ?? 0} orphans: ${review.submission?.orphans?.length ?? 0}`);
  if (review.liveLog?.isWaiting) {
    renderer.writeln(c.dim("  waiting for live review output."));
  } else if (review.liveLog?.displayText) {
    renderer.writeln("  live log:");
    renderer.writeln(`  ${review.liveLog.displayText}`);
  }
}

function renderReviewSession(renderer: Renderer, session: ReviewWorkbenchSessionReport | null): void {
  renderer.writeln(c.bold("  Review Session"));
  if (!session) {
    renderer.writeln(c.dim("  No persisted review session loaded."));
    return;
  }
  renderer.writeln(`  status: ${session.status}`);
  renderer.writeln(`  review: ${session.reviewId}`);
  renderer.writeln(`  trace: ${session.traceId ?? "none"}`);
  renderer.writeln(`  type: ${session.reviewType}`);
  renderer.writeln(`  revision: ${session.revision}`);
  if (session.title) renderer.writeln(`  title: ${session.title}`);
  const summary = session.model.summary;
  renderer.writeln(`  files: ${summary.fileCount} visible: ${summary.visibleFileCount} viewed: ${summary.viewedFileCount}`);
  renderer.writeln(
    `  annotations: ${summary.annotationCount} blocking: ${summary.blockingAnnotationCount} suggestions: ${summary.suggestionCount}`,
  );
  renderer.writeln(`  search matches: ${summary.searchMatchCount}`);
}

function bar(value: number): string {
  return "#".repeat(Math.max(0, Math.round(value)));
}

function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  const ticks = "▁▂▃▄▅▆▇█";
  const max = Math.max(...values, 1);
  return values.map((value) => ticks[Math.min(ticks.length - 1, Math.round((value / max) * (ticks.length - 1)))]).join("");
}

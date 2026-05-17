import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { WorkflowAcceptanceCycleInput } from "@workflow-coordination/interface/workflow-cycle.ts";

export interface WorkflowCycleResultView {
  traceId?: string;
  finalQa?: { status?: string };
  generatedE2e?: {
    status?: string;
    testFiles?: string[];
  };
}

export interface PlanningBreakdownInput {
  planId: string;
  approvedPlanMarkdown: string;
  projectId?: string | null;
  traceId?: string;
  reviewId?: string;
  cycleId?: string | null;
  moduleId?: string | null;
  sourceDocRefs?: Array<{ kind: string; id: string }>;
}

export interface FreeformPlanningPromptInput {
  userPrompt: string;
  selectedDocIds?: string[];
  projectId?: string | null;
  traceId?: string;
  maxDocChars?: number;
}

export interface FreeformPlanningPromptResult {
  context?: {
    traceId?: string;
    sourceRefs?: Array<{ kind: string; id: string }>;
    contextMarkdown?: string;
  };
  prompt: string;
}

export interface FreeformWorkStartInput {
  title: string;
  bodyMd: string;
  userPrompt: string;
  projectId?: string | null;
  parentId?: string | null;
  traceId?: string;
  acpSessionId?: string;
  modeId?: string;
  modelId?: string;
  maxDocChars?: number;
}

export interface FreeformWorkStartResult extends FreeformPlanningPromptResult {
  status: "ready_for_planning";
  document?: { id: string; title?: string };
  eventId?: string;
}

export interface GuidedAcpPlanningInput {
  acpSessionId?: string;
  agentName: string;
  cwd: string;
  userPrompt: string;
  promptTemplateId?: string;
  selectedDocIds?: string[];
  projectId?: string | null;
  traceId?: string;
  modeId?: string;
  modelId?: string;
  permissionMode?: "review_each_tool" | "allow_workspace" | "read_only";
  maxDocChars?: number;
}

export interface GuidedAcpPlanningResult extends FreeformPlanningPromptResult {
  status: "ready_for_acp_prompt";
  session?: {
    acpSessionId?: string;
    agentName?: string;
    cwd?: string;
    modeId?: string;
    modelId?: string;
    permissionMode?: string;
  };
  permissionOptions?: Array<{ optionId?: string; name?: string }>;
  traffic?: { entries?: Array<{ method?: string }> };
  eventId?: string;
}

export interface GuidedAcpSessionActionInput {
  acpSessionId: string;
  action: "resume_session" | "cancel_operation" | "resolve_permission" | "cancel_permission" | "set_mode" | "set_model";
  projectId?: string | null;
  traceId?: string;
  optionId?: string;
  modeId?: string;
  modelId?: string;
}

export interface GuidedAcpSessionActionResult {
  status: "session_action_recorded";
  session?: {
    acpSessionId?: string;
    projectId?: string | null;
    traceId?: string;
    agentName?: string;
    modeId?: string;
    modelId?: string;
    sessionStatus?: string;
  };
  action?: {
    type?: string;
    method?: string;
    optionId?: string;
    modeId?: string;
    modelId?: string;
  };
  traffic?: { entries?: Array<{ method?: string }> };
}

export interface ContinuousUpdateInput {
  trigger: "manual_doc_edit" | "acp_session_update";
  userPrompt: string;
  selectedDocIds?: string[];
  targetTaskIds?: string[];
  changedDocs?: Array<{ id?: string; title?: string; bodyMd?: string; parentId?: string | null }>;
  projectId?: string | null;
  traceId?: string;
  acpSessionId?: string;
  modeId?: string;
  modelId?: string;
  maxDocChars?: number;
}

export interface ContinuousUpdateResult extends FreeformPlanningPromptResult {
  status: "ready_for_replanning";
  traceId?: string;
  acpSessionId?: string;
  targetTaskIds?: string[];
  targetTasks?: Array<{ id: string; title: string; status?: string | null }>;
  missingTargetTaskIds?: string[];
  changedDocs?: Array<{ id: string; title?: string }>;
  eventId?: string;
}

export interface TechnicalPlanningInput {
  source: "freeform_docs" | "guided_acp" | "continuous_update";
  userPrompt: string;
  selectedDocIds?: string[];
  projectId?: string | null;
  traceId?: string;
  maxDocChars?: number;
  planId?: string;
  reviewId?: string;
  prototypePaths?: string[];
  boilerplatePaths?: string[];
  successCriteria?: string[];
}

export interface PlanningArtifactRunInput {
  planId: string;
  artifactPath: string;
  prototypeId?: string;
  artifactId?: string;
  traceId?: string;
  command?: string;
  args?: string[];
  urlPath?: string;
  summary?: string;
  outputRef?: string;
  checks?: string[];
  executedAt?: string;
  cwd?: string;
  branch?: string;
  copyToWorktree?: string[];
  timeoutMs?: number;
  planOnly?: boolean;
}

export interface PlanningArtifactRunResult {
  status?: string;
  runner?: string;
  runId?: string | null;
  exitCode?: number | null;
  durationMs?: number;
  traceId?: string;
  summary?: string;
  outputRef?: string | null;
  transcript?: string;
  history?: Array<{
    status?: string;
    traceId?: string;
    summary?: string;
    outputRef?: string | null;
    executedAt?: string;
  }>;
}

interface PlanningBreakdownTask {
  clientKey: string;
  input?: { title?: string };
  blockedByClientKeys?: string[];
}

export interface PlanningBreakdownResult {
  title: string;
  docs?: Array<{ clientKey: string }>;
  taskDrafts?: PlanningBreakdownTask[];
  warnings?: string[];
}

export interface PlanningBreakdownMaterializationResult {
  breakdown?: PlanningBreakdownResult;
  materialization?: {
    docs?: Array<{ clientKey?: string; id: string }>;
    artifacts?: Array<{ kind?: string; title?: string; path?: string; id: string }>;
    tasks?: Array<{ clientKey?: string; id: string }>;
    dependencyUpdates?: Array<{ taskClientKey?: string; taskId?: string }>;
  };
}

export interface TechnicalPlanningResult extends FreeformPlanningPromptResult {
  status: "ready_for_plan_review";
  eventId?: string;
  reviewPrompt: string;
  plan: {
    planId: string;
    reviewId?: string;
    title: string;
    traceId?: string;
    source: "freeform_docs" | "guided_acp" | "continuous_update";
    markdown: string;
    prototypePaths: string[];
    boilerplatePaths: string[];
    sourceDocRefs?: Array<{ kind: string; id: string }>;
  };
  breakdown: PlanningBreakdownResult;
}

export interface PlanningBreakdownScreenOptions {
  input: PlanningBreakdownInput;
  freeformInput?: FreeformPlanningPromptInput;
  freeformStartInput?: FreeformWorkStartInput;
  guidedAcpInput?: GuidedAcpPlanningInput;
  guidedAcpSessionActionInput?: GuidedAcpSessionActionInput;
  continuousUpdateInput?: ContinuousUpdateInput;
  technicalPlanningInput?: TechnicalPlanningInput;
  artifactExecutionInput?: PlanningArtifactRunInput;
  workflowCycleInput?: WorkflowAcceptanceCycleInput;
  caller: {
    planning: {
      previewApprovedPlanBreakdown(input: PlanningBreakdownInput): Promise<PlanningBreakdownResult>;
      materializeApprovedPlanBreakdown?(input: PlanningBreakdownInput): Promise<PlanningBreakdownMaterializationResult>;
      buildFreeformDocsPlanningPrompt?(input: FreeformPlanningPromptInput): Promise<FreeformPlanningPromptResult>;
      startFreeformWorkFromDocs?(input: FreeformWorkStartInput): Promise<FreeformWorkStartResult>;
      startGuidedAcpPlanningSession?(input: GuidedAcpPlanningInput): Promise<GuidedAcpPlanningResult>;
      recordGuidedAcpSessionAction?(input: GuidedAcpSessionActionInput): Promise<GuidedAcpSessionActionResult>;
      restartPlanningCycleFromUpdates?(input: ContinuousUpdateInput): Promise<ContinuousUpdateResult>;
      generateTechnicalPlanningCycle?(input: TechnicalPlanningInput): Promise<TechnicalPlanningResult>;
      runArtifactExecution?(input: PlanningArtifactRunInput): Promise<PlanningArtifactRunResult>;
    };
    workflows?: {
      runAcceptanceCycle(input: WorkflowAcceptanceCycleInput): Promise<WorkflowCycleResultView>;
    };
  };
}

export class PlanningBreakdownScreen {
  private breakdown: PlanningBreakdownResult | null = null;
  private materialized: PlanningBreakdownMaterializationResult | null = null;
  private freeformPrompt: FreeformPlanningPromptResult | null = null;
  private freeformStart: FreeformWorkStartResult | null = null;
  private guidedAcpStart: GuidedAcpPlanningResult | null = null;
  private guidedAcpSessionAction: GuidedAcpSessionActionResult | null = null;
  private continuousUpdate: ContinuousUpdateResult | null = null;
  private technicalPlanning: TechnicalPlanningResult | null = null;
  private artifactExecution: PlanningArtifactRunResult | null = null;
  private workflowCycle: WorkflowCycleResultView | null = null;
  private error: string | null = null;

  constructor(private readonly opts: PlanningBreakdownScreenOptions) {}

  async load(): Promise<void> {
    try {
      this.breakdown = await this.opts.caller.planning.previewApprovedPlanBreakdown(this.opts.input);
      this.materialized = null;
      this.freeformPrompt = null;
      this.freeformStart = null;
      this.guidedAcpStart = null;
      this.guidedAcpSessionAction = null;
      this.continuousUpdate = null;
      this.technicalPlanning = null;
      this.artifactExecution = null;
      this.workflowCycle = null;
      this.error = null;
    } catch (error) {
      this.breakdown = null;
      this.materialized = null;
      this.freeformPrompt = null;
      this.freeformStart = null;
      this.guidedAcpStart = null;
      this.guidedAcpSessionAction = null;
      this.continuousUpdate = null;
      this.technicalPlanning = null;
      this.artifactExecution = null;
      this.workflowCycle = null;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Planning breakdown"));
    renderer.separator();
    renderer.writeln();

    if (this.error) {
      renderer.writeln(c.red(`  ${this.error}`));
      return;
    }

    if (!this.breakdown) {
      renderer.writeln(c.dim("  Loading approved plan preview."));
      return;
    }

    renderer.infoRow("Plan", this.breakdown.title);
    renderer.infoRow("Trace", this.opts.input.traceId ?? "(none)");
    renderer.infoRow("Docs", `${this.breakdown.docs?.length ?? 0}`);
    renderer.infoRow("Tasks", `${this.breakdown.taskDrafts?.length ?? 0}`);
    renderer.writeln();

    renderer.writeln(c.bold("  Task breakdown"));
    for (const task of this.breakdown.taskDrafts ?? []) {
      const deps = task.blockedByClientKeys?.length
        ? `  blocked by ${task.blockedByClientKeys.join(", ")}`
        : "";
      renderer.writeln(`  ${task.clientKey}  ${task.input?.title ?? "(untitled)"}${deps}`);
    }

    if (this.breakdown.warnings?.length) {
      renderer.writeln();
      renderer.writeln(c.bold("  Warnings"));
      for (const warning of this.breakdown.warnings) renderer.writeln(c.yellow(`  ${warning}`));
    }

    if (this.materialized?.materialization) {
      renderer.writeln();
      renderer.writeln(c.bold("  Materialized"));
      for (const doc of this.materialized.materialization.docs ?? []) {
        renderer.writeln(`  doc ${doc.clientKey ?? ""} ${doc.id}`.trimEnd());
      }
      for (const artifact of this.materialized.materialization.artifacts ?? []) {
        renderer.writeln(`  artifact ${artifact.kind ?? ""} ${artifact.title ?? artifact.path ?? ""} ${artifact.id}`.trimEnd());
      }
      for (const task of this.materialized.materialization.tasks ?? []) {
        renderer.writeln(`  task ${task.clientKey ?? ""} ${task.id}`.trimEnd());
      }
      for (const dependency of this.materialized.materialization.dependencyUpdates ?? []) {
        renderer.writeln(`  dependency ${dependency.taskClientKey ?? ""} ${dependency.taskId ?? ""}`.trimEnd());
      }
    }

    if (this.freeformPrompt) {
      renderer.writeln();
      renderer.writeln(c.bold("  Freeform context"));
      for (const ref of this.freeformPrompt.context?.sourceRefs ?? []) {
        renderer.writeln(`  ${ref.kind}:${ref.id}`);
      }
      renderer.writeln();
      for (const line of this.freeformPrompt.prompt.split("\n").slice(0, 12)) {
        renderer.writeln(`  ${line}`);
      }
    }

    if (this.freeformStart) {
      renderer.writeln();
      renderer.writeln(c.bold("  Freeform work started"));
      renderer.infoRow("Status", this.freeformStart.status);
      if (this.freeformStart.document) {
        renderer.infoRow("Doc", `${this.freeformStart.document.title ?? "(untitled)"} ${this.freeformStart.document.id}`);
      }
      for (const ref of this.freeformStart.context?.sourceRefs ?? []) {
        renderer.writeln(`  ${ref.kind}:${ref.id}`);
      }
      renderer.writeln();
      for (const line of this.freeformStart.prompt.split("\n").slice(0, 12)) {
        renderer.writeln(`  ${line}`);
      }
    }

    if (this.guidedAcpStart) {
      renderer.writeln();
      renderer.writeln(c.bold("  Guided ACP session"));
      renderer.infoRow("Status", this.guidedAcpStart.status);
      if (this.guidedAcpStart.session) {
        renderer.infoRow(
          "Session",
          `${this.guidedAcpStart.session.acpSessionId ?? "(new)"} ${this.guidedAcpStart.session.agentName ?? ""}`.trim(),
        );
        renderer.infoRow("Mode", this.guidedAcpStart.session.modeId ?? "(none)");
        renderer.infoRow("Model", this.guidedAcpStart.session.modelId ?? "(none)");
        renderer.infoRow("Permissions", this.guidedAcpStart.session.permissionMode ?? "(default)");
      }
      for (const ref of this.guidedAcpStart.context?.sourceRefs ?? []) {
        renderer.writeln(`  ${ref.kind}:${ref.id}`);
      }
      for (const entry of this.guidedAcpStart.traffic?.entries ?? []) {
        renderer.writeln(`  ${entry.method ?? "(traffic)"}`);
      }
      renderer.writeln();
      for (const line of this.guidedAcpStart.prompt.split("\n").slice(0, 12)) {
        renderer.writeln(`  ${line}`);
      }
    }

    if (this.guidedAcpSessionAction) {
      renderer.writeln();
      renderer.writeln(c.bold("  Guided ACP action"));
      renderer.infoRow("Status", this.guidedAcpSessionAction.status);
      renderer.infoRow("Session", this.guidedAcpSessionAction.session?.acpSessionId ?? "(none)");
      renderer.infoRow("Action", this.guidedAcpSessionAction.action?.method ?? "(none)");
      renderer.infoRow("State", this.guidedAcpSessionAction.session?.sessionStatus ?? "(unknown)");
      for (const entry of this.guidedAcpSessionAction.traffic?.entries ?? []) {
        renderer.writeln(`  ${entry.method ?? "(traffic)"}`);
      }
    }

    if (this.continuousUpdate) {
      renderer.writeln();
      renderer.writeln(c.bold("  Continuous update"));
      renderer.infoRow("Status", this.continuousUpdate.status);
      renderer.infoRow("Trace", this.continuousUpdate.traceId ?? this.continuousUpdate.context?.traceId ?? "(none)");
      renderer.infoRow("ACP", this.continuousUpdate.acpSessionId ?? "(none)");
      for (const doc of this.continuousUpdate.changedDocs ?? []) {
        renderer.writeln(`  doc ${doc.title ?? doc.id}`);
      }
      for (const taskId of this.continuousUpdate.targetTaskIds ?? []) {
        renderer.writeln(`  task ${taskId}`);
      }
      for (const task of this.continuousUpdate.targetTasks ?? []) {
        renderer.writeln(`  target ${task.title} ${task.status ?? "unknown"}`);
      }
      if (this.continuousUpdate.missingTargetTaskIds?.length) {
        renderer.writeln(`  missing ${this.continuousUpdate.missingTargetTaskIds.join(", ")}`);
      }
      for (const ref of this.continuousUpdate.context?.sourceRefs ?? []) {
        renderer.writeln(`  ${ref.kind}:${ref.id}`);
      }
      renderer.writeln();
      for (const line of this.continuousUpdate.prompt.split("\n").slice(0, 12)) {
        renderer.writeln(`  ${line}`);
      }
    }

    if (this.technicalPlanning) {
      renderer.writeln();
      renderer.writeln(c.bold("  Technical planning"));
      renderer.infoRow("Status", this.technicalPlanning.status);
      renderer.infoRow("Plan", `${this.technicalPlanning.plan.title} ${this.technicalPlanning.plan.planId}`);
      renderer.infoRow("Trace", this.technicalPlanning.plan.traceId ?? this.technicalPlanning.context?.traceId ?? "(none)");
      renderer.infoRow("Source", this.technicalPlanning.plan.source);
      for (const path of this.technicalPlanning.plan.prototypePaths) {
        renderer.writeln(`  prototype ${path}`);
      }
      for (const path of this.technicalPlanning.plan.boilerplatePaths) {
        renderer.writeln(`  boilerplate ${path}`);
      }
      renderer.writeln();
      for (const line of this.technicalPlanning.reviewPrompt.split("\n").slice(0, 12)) {
        renderer.writeln(`  ${line}`);
      }
    }

    if (this.artifactExecution) {
      renderer.writeln();
      renderer.writeln(c.bold("  Artifact execution"));
      renderer.infoRow("Status", this.artifactExecution.status ?? "(unknown)");
      renderer.infoRow("Runner", this.artifactExecution.runner ?? "(unknown)");
      renderer.infoRow("Run", this.artifactExecution.runId ?? "(not run)");
      renderer.infoRow(
        "Exit",
        this.artifactExecution.exitCode === undefined || this.artifactExecution.exitCode === null
          ? "(none)"
          : `${this.artifactExecution.exitCode}`,
      );
      renderer.infoRow("Trace", this.artifactExecution.traceId ?? "(none)");
      renderer.infoRow("Duration", `${this.artifactExecution.durationMs ?? 0}ms`);
      if (this.artifactExecution.summary) renderer.writeln(`  ${this.artifactExecution.summary}`);
      if (this.artifactExecution.outputRef) renderer.writeln(`  output ${this.artifactExecution.outputRef}`);
      for (const line of this.artifactExecution.transcript?.split("\n").filter(Boolean).slice(0, 6) ?? []) {
        renderer.writeln(`  ${line}`);
      }
      if (this.artifactExecution.history?.length) {
        renderer.writeln(c.bold("  Artifact execution history"));
        for (const entry of this.artifactExecution.history.slice(0, 5)) {
          renderer.writeln(
            `  ${entry.status ?? "unknown"} ${entry.executedAt ?? ""} ${entry.summary ?? entry.outputRef ?? ""}`
              .trimEnd(),
          );
        }
      }
    }

    if (this.workflowCycle) {
      renderer.writeln();
      renderer.writeln(c.bold("  Workflow cycle"));
      renderer.infoRow("Trace", this.workflowCycle.traceId ?? "(none)");
      renderer.infoRow("Final QA", this.workflowCycle.finalQa?.status ?? "(pending)");
      renderer.infoRow("Generated E2E", this.workflowCycle.generatedE2e?.status ?? "(pending)");
      for (const file of this.workflowCycle.generatedE2e?.testFiles ?? []) {
        renderer.writeln(`  ${file}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  r refresh  a acp  p acp action  n new freeform  u update  g generate  e execute artifact  x run cycle  m materialize  c context  q back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "r") {
      await this.load();
      return true;
    }
    if (key === "m") {
      await this.materialize();
      return true;
    }
    if (key === "c") {
      await this.buildFreeformPrompt();
      return true;
    }
    if (key === "n") {
      await this.startFreeformWork();
      return true;
    }
    if (key === "a") {
      await this.startGuidedAcpPlanning();
      return true;
    }
    if (key === "p") {
      await this.recordGuidedAcpSessionAction();
      return true;
    }
    if (key === "u") {
      await this.restartContinuousUpdate();
      return true;
    }
    if (key === "g") {
      await this.generateTechnicalPlanning();
      return true;
    }
    if (key === "e") {
      await this.runArtifactExecution();
      return true;
    }
    if (key === "x") {
      await this.runWorkflowCycle();
      return true;
    }
    return false;
  }

  private async materialize(): Promise<void> {
    const materialize = this.opts.caller.planning.materializeApprovedPlanBreakdown;
    if (!materialize) {
      this.error = "Planning materialize caller unavailable.";
      return;
    }
    try {
      this.materialized = await materialize(this.opts.input);
      this.breakdown = this.materialized.breakdown ?? this.breakdown;
      this.error = null;
    } catch (error) {
      this.materialized = null;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async buildFreeformPrompt(): Promise<void> {
    const buildPrompt = this.opts.caller.planning.buildFreeformDocsPlanningPrompt;
    if (!buildPrompt) {
      this.error = "Planning freeform prompt caller unavailable.";
      return;
    }
    if (!this.opts.freeformInput) {
      this.error = "Planning freeform input unavailable.";
      return;
    }
    try {
      this.freeformPrompt = await buildPrompt(this.opts.freeformInput);
      this.error = null;
    } catch (error) {
      this.freeformPrompt = null;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async startFreeformWork(): Promise<void> {
    const start = this.opts.caller.planning.startFreeformWorkFromDocs;
    if (!start) {
      this.error = "Planning freeform start caller unavailable.";
      return;
    }
    if (!this.opts.freeformStartInput) {
      this.error = "Planning freeform start input unavailable.";
      return;
    }
    try {
      this.freeformStart = await start(this.opts.freeformStartInput);
      this.error = null;
    } catch (error) {
      this.freeformStart = null;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async startGuidedAcpPlanning(): Promise<void> {
    const start = this.opts.caller.planning.startGuidedAcpPlanningSession;
    if (!start) {
      this.error = "Planning guided ACP caller unavailable.";
      return;
    }
    if (!this.opts.guidedAcpInput) {
      this.error = "Planning guided ACP input unavailable.";
      return;
    }
    try {
      this.guidedAcpStart = await start(this.opts.guidedAcpInput);
      this.error = null;
    } catch (error) {
      this.guidedAcpStart = null;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async recordGuidedAcpSessionAction(): Promise<void> {
    const record = this.opts.caller.planning.recordGuidedAcpSessionAction;
    if (!record) {
      this.error = "Planning guided ACP session action caller unavailable.";
      return;
    }
    const input = this.guidedAcpSessionActionInput();
    if (!input) {
      this.error = "Planning guided ACP session action input unavailable.";
      return;
    }
    try {
      this.guidedAcpSessionAction = await record(input);
      this.error = null;
    } catch (error) {
      this.guidedAcpSessionAction = null;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async restartContinuousUpdate(): Promise<void> {
    const restart = this.opts.caller.planning.restartPlanningCycleFromUpdates;
    if (!restart) {
      this.error = "Planning continuous update caller unavailable.";
      return;
    }
    if (!this.opts.continuousUpdateInput) {
      this.error = "Planning continuous update input unavailable.";
      return;
    }
    try {
      this.continuousUpdate = await restart(this.opts.continuousUpdateInput);
      this.error = null;
    } catch (error) {
      this.continuousUpdate = null;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async generateTechnicalPlanning(): Promise<void> {
    const generate = this.opts.caller.planning.generateTechnicalPlanningCycle;
    if (!generate) {
      this.error = "Planning generation caller unavailable.";
      return;
    }
    if (!this.opts.technicalPlanningInput) {
      this.error = "Planning generation input unavailable.";
      return;
    }
    try {
      this.technicalPlanning = await generate(this.opts.technicalPlanningInput);
      this.breakdown = this.technicalPlanning.breakdown ?? this.breakdown;
      this.error = null;
    } catch (error) {
      this.technicalPlanning = null;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async runArtifactExecution(): Promise<void> {
    const runArtifact = this.opts.caller.planning.runArtifactExecution;
    if (!runArtifact) {
      this.error = "Planning artifact execution caller unavailable.";
      return;
    }
    const input = this.artifactExecutionInput();
    if (!input) {
      this.error = "Planning artifact execution input unavailable.";
      return;
    }
    try {
      this.artifactExecution = await runArtifact(input);
      this.error = null;
    } catch (error) {
      this.artifactExecution = null;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  private artifactExecutionInput(): PlanningArtifactRunInput | null {
    const generatedPlan = this.technicalPlanning?.plan;
    const generatedPath = generatedPlan?.prototypePaths[0] ?? generatedPlan?.boilerplatePaths[0];
    if (generatedPlan && generatedPath) {
      return {
        ...this.opts.artifactExecutionInput,
        planId: generatedPlan.planId,
        artifactPath: generatedPath,
        traceId: generatedPlan.traceId ?? this.opts.artifactExecutionInput?.traceId ?? this.opts.input.traceId,
      };
    }
    return this.opts.artifactExecutionInput ?? null;
  }

  private guidedAcpSessionActionInput(): GuidedAcpSessionActionInput | null {
    if (this.opts.guidedAcpSessionActionInput) return this.opts.guidedAcpSessionActionInput;
    const session = this.guidedAcpStart?.session;
    if (!session?.acpSessionId) return null;
    return {
      acpSessionId: session.acpSessionId,
      action: "resume_session",
      projectId: this.opts.guidedAcpInput?.projectId ?? null,
      traceId: this.opts.guidedAcpInput?.traceId,
    };
  }

  private async runWorkflowCycle(): Promise<void> {
    const runCycle = this.opts.caller.workflows?.runAcceptanceCycle;
    if (!runCycle) {
      this.error = "Workflow cycle caller unavailable.";
      return;
    }
    if (!this.opts.workflowCycleInput) {
      this.error = "Workflow cycle input unavailable.";
      return;
    }
    try {
      this.workflowCycle = await runCycle(this.opts.workflowCycleInput);
      this.error = null;
    } catch (error) {
      this.workflowCycle = null;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }
}

import "reflect-metadata";

import type { AgentProvider } from "@ai-hero/sandcastle";
import { Inject, Injectable } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";

import {
  runAgent as runSandboxAgent,
  SandboxProviderUnavailableError,
  type SandboxRunnerDeps,
} from "@execution-orchestration/infrastructure/agent-runtime/sandbox-runner.ts";
import type {
  AgentRunRequest,
  AgentRunResult,
} from "@execution-orchestration/infrastructure/agent-runtime/types.ts";
import {
  buildAcpPlanningPromptWithFreeformDocs,
  buildFreeformDocsPlanningContext,
  type FreeformPlanningContext,
  type FreeformPlanningContextDoc,
} from "@planning-review/application/freeform-doc-context";
import {
  buildTechnicalPlanningCycleDraft,
  type TechnicalPlanningCycleDraft,
  type TechnicalPlanningCycleSource,
  type TechnicalPlanningTaskSeed,
} from "@planning-review/application/technical-planning-cycle";
import {
  buildPlanningArtifactPreviews,
} from "@planning-review/application/artifact-preview";
import {
  buildPlanningArtifactExecutionRecord,
  mergePlanningArtifactExecutionMetadata,
  type PlanningArtifactExecutionInput,
  type PlanningArtifactExecutionRecord,
} from "@planning-review/application/artifact-execution";
import { createInMemoryTrafficRecorder, type TrafficEntry, type TrafficEntryInput } from "@agent-client-protocol/application/traffic";

import {
  previewApprovedPlanBreakdown,
} from "@planning-review/application/approved-plan-actions";
import type {
  ApprovedPlanBreakdown,
  ApprovedPlanMaterializationResult,
  BuildApprovedPlanBreakdownInput,
} from "@planning-review/application/approved-plan-breakdown";

import {
  FulcrumArtifactEntity,
  FulcrumPlanEntity,
  type FulcrumPlanPrototype,
  FulcrumPlanPrototypeEntity,
} from "@planning-review/infrastructure/database/review-workflow.entities";
import {
  FulcrumAcpSessionEntity,
  FulcrumDocumentEntity,
  FulcrumProjectEntity,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities";

export type ApprovedPlanPreview = ApprovedPlanBreakdown;

export interface PlanningFreeformPromptInput {
  projectId: string;
  userPrompt: string;
  selectedDocIds?: string[];
  traceId?: string;
  maxDocChars?: number;
}

export interface PlanningFreeformPromptResult {
  context: FreeformPlanningContext;
  prompt: string;
}

export interface PlanningTechnicalCycleInput extends PlanningFreeformPromptInput {
  source: TechnicalPlanningCycleSource;
  planId?: string;
  reviewId?: string;
  prototypePaths?: string[];
  boilerplatePaths?: string[];
  successCriteria?: string[];
  taskSeeds?: TechnicalPlanningTaskSeed[];
}

export interface PlanningTechnicalCycleResult extends TechnicalPlanningCycleDraft {
  eventId: string;
}

export type { PlanningArtifactExecutionInput, PlanningArtifactExecutionRecord };

export interface PersistedPlanningArtifactExecutionRecord extends Omit<PlanningArtifactExecutionRecord, "artifactId"> {
  prototypeId: string;
  artifactId?: string | null;
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

export interface PlanningArtifactRunOutput extends PersistedPlanningArtifactExecutionRecord {
  runner: "sandbox-agent" | "not-run";
  runId: string | null;
  exitCode: number | null;
  durationMs: number;
  transcript: string;
  history: PersistedPlanningArtifactExecutionRecord[];
  exitReason?: AgentRunResult["exitReason"];
  transcriptPath?: string;
  workspaceDiffPath?: string;
}

export interface PlanningArtifactRunDeps {
  runAgent?: (request: AgentRunRequest, deps?: SandboxRunnerDeps) => Promise<AgentRunResult>;
  now?: () => Date;
  createRunId?: (input: { planId: string; artifactPath: string; now: Date }) => string;
  sandboxDeps?: Omit<SandboxRunnerDeps, "agentProvider">;
}

export interface ApprovedPlanMaterializeInput extends BuildApprovedPlanBreakdownInput {
  projectId: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  projectSlug: string;
  projectName: string;
}

export interface ApprovedPlanMaterializeResult {
  breakdown: ApprovedPlanBreakdown;
  materialization: ApprovedPlanMaterializationResult;
}

export interface PlanningProjectScopeInput {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
}

export interface PlanningDocumentResult {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  bodyMd: string;
  sourceType: string;
  traceId: string;
}

export interface PlanningFreeformStartInput extends PlanningProjectScopeInput {
  documentId?: string;
  parentId?: string | null;
  title: string;
  bodyMd: string;
  userPrompt: string;
  traceId?: string;
  acpSessionId?: string;
  modeId?: string;
  modelId?: string;
  maxDocChars?: number;
}

export interface PlanningFreeformStartResult {
  status: "ready_for_planning";
  document: PlanningDocumentResult;
  context: FreeformPlanningContext;
  prompt: string;
}

export type GuidedAcpPermissionMode = "review_each_tool" | "allow_workspace" | "read_only";

export interface PlanningGuidedAcpStartInput extends PlanningProjectScopeInput {
  acpSessionId: string;
  agentName: string;
  cwd: string;
  userPrompt: string;
  promptTemplateId?: string;
  selectedDocIds?: string[];
  traceId?: string;
  modeId?: string;
  modelId?: string;
  permissionMode?: GuidedAcpPermissionMode;
  maxDocChars?: number;
}

export interface PlanningGuidedAcpSession {
  acpSessionId: string;
  agentName: string;
  cwd: string;
  promptTemplateId: string;
  projectId: string;
  traceId: string;
  modeId: string;
  modelId?: string;
  permissionMode: GuidedAcpPermissionMode;
}

export interface PlanningGuidedAcpStartResult {
  status: "ready_for_acp_prompt";
  session: PlanningGuidedAcpSession;
  traffic: { entries: TrafficEntry[] };
  context: FreeformPlanningContext;
  prompt: string;
}

export type PlanningGuidedAcpSessionAction =
  | "resume_session"
  | "cancel_operation"
  | "resolve_permission"
  | "cancel_permission"
  | "set_mode"
  | "set_model";

export interface PlanningGuidedAcpSessionActionInput {
  acpSessionId: string;
  action: PlanningGuidedAcpSessionAction;
  projectId?: string | null;
  traceId?: string;
  optionId?: string;
  modeId?: string;
  modelId?: string;
}

export interface PlanningGuidedAcpSessionActionResult {
  status: "session_action_recorded";
  session: {
    acpSessionId: string;
    projectId: string | null;
    traceId: string;
    agentName: string;
    modeId: string;
    modelId?: string;
    sessionStatus: string;
  };
  action: {
    type: PlanningGuidedAcpSessionAction;
    method: string;
    optionId?: string;
    modeId?: string;
    modelId?: string;
  };
  traffic: { entries: TrafficEntry[] };
}

export type ContinuousUpdateTrigger = "manual_doc_edit" | "acp_session_update";

export interface ContinuousChangedDocInput {
  id?: string;
  title?: string;
  bodyMd?: string;
}

export interface ContinuousTargetTaskContext {
  id: string;
  title: string;
  status: string;
  successCriteria: string[];
  blockedByTaskIds: string[];
  blocksTaskIds: string[];
  blockedByTasks: Array<{ id: string; title: string; status: string }>;
  blocksTasks: Array<{ id: string; title: string; status: string }>;
}

export interface PlanningContinuousUpdateInput extends PlanningProjectScopeInput {
  trigger: ContinuousUpdateTrigger;
  userPrompt: string;
  traceId?: string;
  acpSessionId?: string;
  modeId?: string;
  modelId?: string;
  selectedDocIds?: string[];
  targetTaskIds?: string[];
  changedDocs?: ContinuousChangedDocInput[];
  maxDocChars?: number;
}

export interface PlanningContinuousUpdateResult {
  status: "ready_for_replanning";
  trigger: ContinuousUpdateTrigger;
  traceId: string;
  acpSessionId?: string;
  modeId?: string;
  modelId?: string;
  targetTaskIds: string[];
  targetTasks: ContinuousTargetTaskContext[];
  missingTargetTaskIds: string[];
  changedDocs: PlanningDocumentResult[];
  traffic: { entries: TrafficEntry[] };
  context: FreeformPlanningContext;
  prompt: string;
}

export class PlanningPreviewService {
  constructor(private readonly dataSource?: DataSource) {}

  async previewApprovedPlan(
    input: BuildApprovedPlanBreakdownInput,): Promise<ApprovedPlanPreview> {
    return await previewApprovedPlanBreakdown(input);
  }

  async buildFreeformDocsPlanningPrompt(
    input: PlanningFreeformPromptInput,): Promise<PlanningFreeformPromptResult> {
    if (!this.dataSource) {
      throw new Error("PlanningPreviewService requires a TypeORM DataSource to build freeform planning prompts.");
    }
    if (!input.projectId.trim()) throw new Error("projectId is required.");
    if (!input.userPrompt.trim()) throw new Error("userPrompt is required.");

    const documents = await this.dataSource.manager.transaction(async (manager) =>
      await loadPlanningDocuments(manager, input.selectedDocIds ?? [], input.projectId)
    );
    const traceId = input.traceId ?? planningWorkflowId("trace", input.projectId, input.userPrompt);
    const context = buildContextFromDocuments(
      documents,
      input.selectedDocIds,
      traceId,
      input.maxDocChars,
    );
    return {
      context,
      prompt: buildAcpPlanningPromptWithFreeformDocs({
        userPrompt: input.userPrompt,
        context,
      }),
    };
  }

  async generateTechnicalPlanningCycle(
    input: PlanningTechnicalCycleInput,): Promise<PlanningTechnicalCycleResult> {
    if (!this.dataSource) {
      throw new Error("PlanningPreviewService requires a TypeORM DataSource to generate technical planning cycles.");
    }
    if (!input.projectId.trim()) throw new Error("projectId is required.");
    if (!input.userPrompt.trim()) throw new Error("userPrompt is required.");

    const planning = await this.buildFreeformDocsPlanningPrompt(input);
    const draft = buildTechnicalPlanningCycleDraft({
      source: input.source,
      userPrompt: input.userPrompt,
      context: planning.context,
      planId: input.planId,
      reviewId: input.reviewId,
      projectId: input.projectId,
      traceId: input.traceId,
      prototypePaths: input.prototypePaths,
      boilerplatePaths: input.boilerplatePaths,
      successCriteria: input.successCriteria,
      taskSeeds: input.taskSeeds,
    });
    const eventId = planningWorkflowId("event", draft.plan.planId, "technical-planning-generated");
    await this.dataSource.transaction(async (manager) => {
      const project = await manager.getRepository(FulcrumProjectEntity).findOneBy({ id: input.projectId });
      if (!project) throw new Error(`Project not found: ${input.projectId}`);
      await manager.getRepository(FulcrumPlanEntity).save({
        id: draft.plan.planId,
        projectId: input.projectId,
        traceId: draft.plan.traceId ?? planningWorkflowId("trace", input.projectId, draft.plan.planId),
        title: draft.plan.title,
        planMd: draft.plan.markdown,
        status: "draft",
        sourceDocId: draft.plan.sourceDocRefs[0]?.id ?? null,
      });
      const artifactPaths = [
        ...draft.plan.prototypePaths.map((path) => ({ kind: "prototype", path })),
        ...draft.plan.boilerplatePaths.map((path) => ({ kind: "boilerplate", path })),
      ];
      for (const [index, artifact] of artifactPaths.entries()) {
        const id = planningWorkflowId("artifact", draft.plan.planId, String(index + 1));
        const preview = draft.artifactPreviews.find((candidate) => candidate.kind === artifact.kind && candidate.path === artifact.path);
        await manager.getRepository(FulcrumArtifactEntity).save({
          id,
          projectId: input.projectId,
          traceId: draft.plan.traceId ?? planningWorkflowId("trace", input.projectId, draft.plan.planId),
          kind: artifact.kind,
          title: artifactTitle(artifact.path),
          bodyPath: artifact.path,
          checksumSha256: null,
        });
        await manager.getRepository(FulcrumPlanPrototypeEntity).save({
          id: planningWorkflowId("prototype", draft.plan.planId, String(index + 1)),
          planId: draft.plan.planId,
          artifactId: id,
          kind: artifact.kind,
          title: artifactTitle(artifact.path),
          status: "draft",
          outputRef: artifact.path,
          metadata: {
            eventId,
            source: draft.plan.source,
            traceId: draft.plan.traceId ?? null,
            ...(preview ? { preview } : {}),
          },
        });
      }
    });

    return {
      ...draft,
      prompt: planning.prompt,
      eventId,
    };
  }

  async recordArtifactExecution(
    input: PlanningArtifactExecutionInput,
  ): Promise<PersistedPlanningArtifactExecutionRecord> {
    if (!this.dataSource) {
      throw new Error("PlanningPreviewService requires a TypeORM DataSource to record artifact execution.");
    }
    const record = buildPlanningArtifactExecutionRecord(input);

    return await this.dataSource.transaction(async (manager) => {
      const prototype = await loadPlanPrototypeForArtifact(
        manager,
        record.planId,
        record.artifactPath,
        record.prototypeId,
        record.artifactId,
      );
      if (!prototype) throw new Error(`Planning artifact not found: ${record.artifactPath}`);
      const persistedRecord = buildPlanningArtifactExecutionRecord({
        ...record,
        prototypeId: prototype.id,
        artifactId: prototype.artifactId ?? undefined,
      });
      await manager.getRepository(FulcrumPlanPrototypeEntity).save({
        ...prototype,
        status: persistedRecord.prototypeStatus,
        metadata: mergePlanningArtifactExecutionMetadata(prototype.metadata, persistedRecord),
      });
      return {
        ...persistedRecord,
        prototypeId: prototype.id,
        artifactId: prototype.artifactId,
      };
    });
  }

  async runArtifactExecution(
    input: PlanningArtifactRunInput,
    deps: PlanningArtifactRunDeps = {},
  ): Promise<PlanningArtifactRunOutput> {
    if (!this.dataSource) {
      throw new Error("PlanningPreviewService requires a TypeORM DataSource to run artifact execution.");
    }
    const planId = input.planId.trim();
    if (!planId) throw new Error("planId is required.");
    const artifactPath = input.artifactPath.trim();
    if (!artifactPath) throw new Error("artifactPath is required.");

    const runPlan = await this.dataSource.transaction(async (manager) => {
      const prototype = await loadPlanPrototypeForArtifact(
        manager,
        planId,
        artifactPath,
        input.prototypeId,
        input.artifactId,
      );
      if (!prototype) throw new Error(`Planning artifact not found: ${artifactPath}`);
      return buildArtifactRunPlan(prototype, { ...input, planId, artifactPath });
    });
    const now = deps.now?.() ?? new Date();
    const executedAt = input.executedAt?.trim() || now.toISOString();

    if (input.planOnly || !runPlan.command) {
      const status: PlanningArtifactExecutionInput["status"] = runPlan.command ? "ready" : "blocked";
      const record = await this.recordArtifactExecution({
        planId,
        artifactPath,
        prototypeId: runPlan.prototype.id,
        artifactId: runPlan.prototype.artifactId ?? undefined,
        status,
        traceId: runPlan.traceId,
        command: runPlan.command,
        args: runPlan.args,
        urlPath: runPlan.urlPath,
        summary: trimmed(input.summary) ?? (runPlan.command
          ? `Artifact execution is ready to run: ${formatCommand(runPlan.command, runPlan.args)}.`
          : "No runnable artifact command was available from the preview metadata."),
        outputRef: trimmed(input.outputRef),
        checks: runPlan.checks,
        executedAt,
      });
      return {
        ...record,
        runner: "not-run",
        runId: null,
        exitCode: null,
        durationMs: 0,
        transcript: "",
        history: await this.loadArtifactExecutionHistory({
          planId,
          artifactPath,
          prototypeId: record.prototypeId,
        }),
      };
    }

    const timeoutMs = normalizedPositiveInteger(input.timeoutMs) ?? 60_000;
    const runId = deps.createRunId?.({ planId, artifactPath, now })
      ?? buildPlanningArtifactRunId({ planId, artifactPath, now });
    const branch = input.branch?.trim() || `agent/${runId}`;
    const copyToWorktree = input.copyToWorktree
      ? normalizeStringArray(input.copyToWorktree)
      : [artifactPath];
    const request: AgentRunRequest = {
      runId,
      worktree: {
        cwd: input.cwd?.trim() || process.cwd(),
        branch,
        ...(copyToWorktree.length ? { copyToWorktree } : {}),
      },
      agentProfile: {
        name: "planning-artifact-command",
        cliPath: runPlan.command,
        defaultFlags: runPlan.args,
        skillFolder: ".",
        authEnvVars: [],
        sandcastleProvider: "noSandbox",
        maxIterations: 1,
        defaultTimeout: timeoutMs,
      },
      prompt: [
        `Run planning artifact command for ${artifactPath}.`,
        "Finish by putting COMPLETE alone on the final non-empty line when the command passes.",
      ].join("\n"),
      contextBundle: {
        planId,
        artifactPath,
        traceId: runPlan.traceId,
        command: runPlan.command,
        args: runPlan.args,
        checks: runPlan.checks,
      },
      timeout: timeoutMs,
      opts: { maxIterations: 1 },
    };
    const runner = deps.runAgent ?? runSandboxAgent;
    let result: AgentRunResult;
    try {
      result = await runner(request, {
        ...deps.sandboxDeps,
        agentProvider: artifactCommandAgentProvider(runPlan.command, runPlan.args),
      });
    } catch (error) {
      const status = artifactRunErrorStatus(error);
      const record = await this.recordArtifactExecution({
        planId,
        artifactPath,
        prototypeId: runPlan.prototype.id,
        artifactId: runPlan.prototype.artifactId ?? undefined,
        status,
        traceId: runPlan.traceId,
        command: runPlan.command,
        args: runPlan.args,
        urlPath: runPlan.urlPath,
        summary: trimmed(input.summary) ?? summarizeArtifactRunError(error),
        outputRef: trimmed(input.outputRef),
        checks: runPlan.checks,
        executedAt,
      });
      return {
        ...record,
        runner: "sandbox-agent",
        runId,
        exitCode: null,
        durationMs: 0,
        transcript: summarizeArtifactRunError(error),
        history: await this.loadArtifactExecutionHistory({
          planId,
          artifactPath,
          prototypeId: record.prototypeId,
        }),
      };
    }
    const status: PlanningArtifactExecutionInput["status"] =
      result.exitCode === 0 && result.exitReason === "complete" ? "passed" : "failed";
    const record = await this.recordArtifactExecution({
      planId,
      artifactPath,
      prototypeId: runPlan.prototype.id,
      artifactId: runPlan.prototype.artifactId ?? undefined,
      status,
      traceId: runPlan.traceId,
      command: runPlan.command,
      args: runPlan.args,
      urlPath: runPlan.urlPath,
      summary: trimmed(input.summary) ?? summarizeArtifactRun(result),
      outputRef: trimmed(input.outputRef) ?? result.transcriptPath ?? result.workspaceDiffPath,
      checks: runPlan.checks,
      executedAt,
    });
    return {
      ...record,
      runner: "sandbox-agent",
      runId,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      transcript: result.transcript,
      history: await this.loadArtifactExecutionHistory({
        planId,
        artifactPath,
        prototypeId: record.prototypeId,
      }),
      exitReason: result.exitReason,
      ...(result.transcriptPath ? { transcriptPath: result.transcriptPath } : {}),
      ...(result.workspaceDiffPath ? { workspaceDiffPath: result.workspaceDiffPath } : {}),
    };
  }

  async loadArtifactExecutionHistory(input: {
    planId: string;
    artifactPath: string;
    prototypeId?: string;
    artifactId?: string;
  }): Promise<PersistedPlanningArtifactExecutionRecord[]> {
    if (!this.dataSource) {
      throw new Error("PlanningPreviewService requires a TypeORM DataSource to load artifact execution history.");
    }
    return await this.dataSource.transaction(async (manager) => {
      const prototype = await loadPlanPrototypeForArtifact(
        manager,
        input.planId,
        input.artifactPath,
        input.prototypeId,
        input.artifactId,
      );
      if (!prototype) return [];
      return artifactExecutionHistoryForPrototype(prototype);
    });
  }

  async materializeApprovedPlan(
    input: ApprovedPlanMaterializeInput,): Promise<ApprovedPlanMaterializeResult> {
    if (!this.dataSource) {
      throw new Error("PlanningPreviewService requires a TypeORM DataSource to materialize approved plans.");
    }
    if (!input.projectId?.trim()) throw new Error("projectId is required.");

    const breakdown = await this.previewApprovedPlan(input);
    const traceId = input.traceId ?? `trace-${input.planId}`;
    const projectId = input.projectId;
    const docIds = new Map<string, string>;
    const taskIds = new Map<string, string>;
    const artifactPreviews = buildPlanningArtifactPreviews({ artifacts: breakdown.artifacts });

    const materialization = await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(FulcrumWorkspaceEntity).save({
        id: input.workspaceId,
        slug: input.workspaceSlug,
        name: input.workspaceName,
      });
      await manager.getRepository(FulcrumProjectEntity).save({
        id: projectId,
        workspaceId: input.workspaceId,
        slug: input.projectSlug,
        name: input.projectName,
        traceId,
      });

      const docs: ApprovedPlanMaterializationResult["docs"] = [];
      for (const draft of breakdown.docs) {
        const id = planningWorkflowId("doc", input.planId, draft.clientKey);
        docIds.set(draft.clientKey, id);
        await manager.getRepository(FulcrumDocumentEntity).save({
          id,
          projectId,
          title: draft.input.title,
          bodyMd: draft.input.bodyMd,
          sourceType: workflowStageOf(draft.input.frontmatter),
          traceId,
        });
        docs.push({ clientKey: draft.clientKey, id });
      }

      await manager.getRepository(FulcrumPlanEntity).save({
        id: input.planId,
        projectId,
        traceId,
        title: breakdown.title,
        planMd: input.approvedPlanMarkdown,
        status: "approved",
        sourceDocId: docIds.get("plan-doc") ?? null,
      });

      const artifacts: ApprovedPlanMaterializationResult["artifacts"] = [];
      for (const [index, artifact] of breakdown.artifacts.entries()) {
        const id = planningWorkflowId("artifact", input.planId, String(index + 1));
        const preview = artifactPreviews.find((candidate) => candidate.kind === artifact.kind && candidate.path === artifact.path);
        await manager.getRepository(FulcrumArtifactEntity).save({
          id,
          projectId,
          traceId,
          kind: artifact.kind,
          title: artifact.title,
          bodyPath: artifact.path,
          checksumSha256: null,
        });
        await manager.getRepository(FulcrumPlanPrototypeEntity).save({
          id: planningWorkflowId("prototype", input.planId, String(index + 1)),
          planId: input.planId,
          artifactId: id,
          kind: artifact.kind,
          title: artifact.title,
          status: "planned",
          outputRef: artifact.path,
          metadata: {
            sourcePlanId: artifact.sourcePlanId,
            traceId: artifact.traceId ?? traceId,
            ...(preview ? { preview } : {}),
          },
        });
        artifacts.push({...artifact, id });
      }

      const tasks: ApprovedPlanMaterializationResult["tasks"] = [];
      for (const draft of breakdown.taskDrafts) {
        const id = planningWorkflowId("task", input.planId, draft.clientKey);
        taskIds.set(draft.clientKey, id);
        await manager.getRepository(FulcrumTaskEntity).save({
          id,
          projectId,
          title: draft.input.title,
          status: "todo",
          successCriteria: draft.successCriteria.map((criterion) => criterion.text),
          traceId,
        });
        tasks.push({ clientKey: draft.clientKey, id });
      }

      const dependencyUpdates = await materializeDependencies(
        manager,
        input.planId,
        projectId,
        traceId,
        breakdown.dependencyUpdates,
        taskIds,);

      return {
        docs,
        artifacts,
        tasks,
        dependencyUpdates,
      };
    });

    return { breakdown, materialization };
  }

  async startFreeformWork(
    input: PlanningFreeformStartInput,): Promise<PlanningFreeformStartResult> {
    if (!this.dataSource) {
      throw new Error("PlanningPreviewService requires a TypeORM DataSource to start freeform work.");
    }

    const traceId = input.traceId ?? planningWorkflowId("trace", input.projectId, input.title);
    const documentId = input.documentId ?? planningWorkflowId("doc", traceId, input.title);
    const document = await this.dataSource.transaction(async (manager) => {
      await ensureWorkspaceProject(manager, input, traceId);
      const row: PlanningDocumentResult = {
        id: documentId,
        projectId: input.projectId,
        parentId: input.parentId ?? null,
        title: input.title,
        bodyMd: input.bodyMd,
        sourceType: "freeform_work_intake",
        traceId,
      };
      await manager.getRepository(FulcrumDocumentEntity).save(row);
      return row;
    });

    const context = buildContextFromDocuments([document], [document.id], traceId, input.maxDocChars);
    return {
      status: "ready_for_planning",
      document,
      context,
      prompt: buildAcpPlanningPromptWithFreeformDocs({
        userPrompt: input.userPrompt,
        context,
      }),
    };
  }

  async startGuidedAcpPlanning(
    input: PlanningGuidedAcpStartInput,): Promise<PlanningGuidedAcpStartResult> {
    if (!this.dataSource) {
      throw new Error("PlanningPreviewService requires a TypeORM DataSource to start guided ACP planning.");
    }

    const traceId = input.traceId ?? planningWorkflowId("trace", input.projectId, input.acpSessionId);
    const modeId = input.modeId ?? "planning";
    const promptTemplateId = input.promptTemplateId ?? "prototype-first";
    const permissionMode = input.permissionMode ?? "review_each_tool";
    const documents = await this.dataSource.transaction(async (manager) => {
      await ensureWorkspaceProject(manager, input, traceId);
      const docs = await loadPlanningDocuments(manager, input.selectedDocIds ?? [], input.projectId);
      const context = buildContextFromDocuments(docs, input.selectedDocIds, traceId, input.maxDocChars);
      const session: PlanningGuidedAcpSession = {
        acpSessionId: input.acpSessionId,
        agentName: input.agentName,
        cwd: input.cwd,
        promptTemplateId,
        projectId: input.projectId,
        traceId,
        modeId,...(input.modelId ? { modelId: input.modelId } : {}),
        permissionMode,
      };
      const prompt = appendGuidedAcpInstructions(
        buildAcpPlanningPromptWithFreeformDocs({ userPrompt: input.userPrompt, context }),
        session,);
      const traffic = createInMemoryTrafficRecorder();
      traffic.addEntry({
        direction: "out",
        type: "request",
        method: "session/new",
        requestId: 1,
        payload: {
          acpSessionId: input.acpSessionId,
          agentName: input.agentName,
          cwd: input.cwd,
          modeId,
          modelId: input.modelId,
          permissionMode,
        },
      });
      traffic.addEntry({
        direction: "out",
        type: "request",
        method: "session/prompt",
        requestId: 2,
        payload: {
          acpSessionId: input.acpSessionId,
          traceId,
          promptTemplateId,
          sourceRefs: context.sourceRefs,
          prompt,
        },
      });
      await manager.getRepository(FulcrumAcpSessionEntity).save({
        id: input.acpSessionId,
        projectId: input.projectId,
        traceId,
        agentName: input.agentName,
        mode: modeId,
        model: input.modelId ?? null,
        status: "ready_for_acp_prompt",
        trafficLog: traffic.entries,
      });
      return { context, prompt, session, traffic: { entries: traffic.entries } };
    });

    return {
      status: "ready_for_acp_prompt",...documents,
    };
  }

  async recordGuidedAcpSessionAction(
    input: PlanningGuidedAcpSessionActionInput,
  ): Promise<PlanningGuidedAcpSessionActionResult> {
    if (!this.dataSource) {
      throw new Error("PlanningPreviewService requires a TypeORM DataSource to record guided ACP session actions.");
    }
    const acpSessionId = input.acpSessionId.trim();
    if (!acpSessionId) throw new Error("acpSessionId is required.");
    const action = guidedAcpSessionAction(input.action);

    return await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(FulcrumAcpSessionEntity);
      const session = await repository.findOneBy({ id: acpSessionId });
      if (!session) throw new Error(`ACP session not found: ${acpSessionId}`);
      if (input.projectId && session.projectId && input.projectId !== session.projectId) {
        throw new Error(`ACP session '${acpSessionId}' does not belong to project '${input.projectId}'.`);
      }

      const traceId = input.traceId?.trim() || session.traceId;
      const traffic = createInMemoryTrafficRecorder();
      for (const entry of normalizeTrafficLog(session.trafficLog)) {
        traffic.addEntry(toTrafficInput(entry));
      }
      const actionTraffic = guidedAcpActionTraffic({
        action,
        acpSessionId,
        traceId,
        requestId: traffic.entries.length + 1,
        optionId: input.optionId,
        modeId: input.modeId,
        modelId: input.modelId,
      });
      traffic.addEntry(actionTraffic.entry);

      const mode = action === "set_mode" ? requiredActionValue(input.modeId, "modeId") : session.mode;
      const model = action === "set_model" ? requiredActionValue(input.modelId, "modelId") : session.model;
      const sessionStatus = guidedAcpSessionStatus(action);
      await repository.save({
        ...session,
        traceId,
        mode,
        model,
        status: sessionStatus,
        trafficLog: traffic.entries,
      });

      return {
        status: "session_action_recorded",
        session: {
          acpSessionId,
          projectId: session.projectId,
          traceId,
          agentName: session.agentName,
          modeId: mode,
          ...(model ? { modelId: model } : {}),
          sessionStatus,
        },
        action: actionTraffic.action,
        traffic: { entries: traffic.entries },
      };
    });
  }

  async restartPlanningCycleFromUpdates(
    input: PlanningContinuousUpdateInput,): Promise<PlanningContinuousUpdateResult> {
    if (!this.dataSource) {
      throw new Error("PlanningPreviewService requires a TypeORM DataSource to restart planning cycles.");
    }
    if (!input.userPrompt.trim()) {
      throw new Error("userPrompt is required.");
    }
    if (input.trigger === "manual_doc_edit" && !input.changedDocs?.length) {
      throw new Error("manual_doc_edit requires at least one changed document.");
    }

    const traceId = input.traceId ?? planningWorkflowId("trace", input.projectId, input.trigger);
    return await this.dataSource.transaction(async (manager) => {
      await ensureWorkspaceProject(manager, input, traceId);
      const changedDocs = await persistContinuousChangedDocs(manager, input, traceId);
      const selectedDocIds = uniqueNonEmpty([...(input.selectedDocIds ?? []),...changedDocs.map((doc) => doc.id),
      ]);
      if (selectedDocIds.length === 0) {
        throw new Error("At least one selected or changed document is required to restart planning.");
      }

      const documents = await loadPlanningDocuments(manager, selectedDocIds, input.projectId);
      const context = buildContextFromDocuments(documents, selectedDocIds, traceId, input.maxDocChars);
      const taskContext = await loadContinuousTargetTaskContext(manager, input.projectId, input.targetTaskIds ?? []);
      const prompt = appendContinuousUpdateInstructions(
        buildAcpPlanningPromptWithFreeformDocs({ userPrompt: input.userPrompt, context }),
        input,
        selectedDocIds,
        taskContext,);
      const traffic = await updateContinuousAcpSession(manager, input, traceId, context, prompt);

      return {
        status: "ready_for_replanning",
        trigger: input.trigger,
        traceId,...(input.acpSessionId ? { acpSessionId: input.acpSessionId } : {}),...(input.modeId ? { modeId: input.modeId } : {}),...(input.modelId ? { modelId: input.modelId } : {}),
        targetTaskIds: input.targetTaskIds ?? [],
        targetTasks: taskContext.tasks,
        missingTargetTaskIds: taskContext.missingTaskIds,
        changedDocs,
        traffic,
        context,
        prompt,
      };
    });
  }
}

Injectable()(PlanningPreviewService);
Inject(DataSource)(PlanningPreviewService, undefined, 0);

type DependencyUpdate = ApprovedPlanBreakdown["dependencyUpdates"][number];

async function materializeDependencies(
  manager: EntityManager,
  planId: string,
  projectId: string,
  traceId: string,
  updates: DependencyUpdate[],
  taskIds: Map<string, string>,): Promise<ApprovedPlanMaterializationResult["dependencyUpdates"]> {
  const materialized: ApprovedPlanMaterializationResult["dependencyUpdates"] = [];
  for (const update of updates) {
    const taskId = taskIds.get(update.taskClientKey);
    if (!taskId) continue;
    const blockedByTaskIds = update.blockedByClientKeys.map((clientKey) => taskIds.get(clientKey)).filter((id): id is string => Boolean(id));

    for (const blockedByTaskId of blockedByTaskIds) {
      await manager.getRepository(FulcrumTaskDependencyEntity).save({
        id: planningWorkflowId("dependency", planId, taskId, blockedByTaskId),
        projectId,
        taskId,
        dependsOnTaskId: blockedByTaskId,
        dependencyKind: "approved_plan_dependency",
        traceId,
      });
    }

    materialized.push({
      taskClientKey: update.taskClientKey,
      taskId,
      blockedByClientKeys: [...update.blockedByClientKeys],
      blockedByTaskIds,
    });
  }
  return materialized;
}

function workflowStageOf(frontmatter: unknown): string {
  if (frontmatter && typeof frontmatter === "object" && "workflowStage" in frontmatter) {
    const workflowStage = (frontmatter as { workflowStage?: unknown }).workflowStage;
    if (typeof workflowStage === "string" && workflowStage.trim()) return workflowStage;
  }
  return "approved_plan";
}

function planningWorkflowId(prefix: string,...parts: string[]): string {
  const normalized = parts.join("-").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").toLowerCase();
  return `${prefix}-${normalized}`.slice(0, 128);
}

export function buildPlanningArtifactRunId(input: {
  planId: string;
  artifactPath: string;
  now?: Date;
  nonce?: string;
}): string {
  const timestamp = String((input.now ?? new Date()).getTime());
  const nonce = input.nonce?.trim() || crypto.randomUUID();
  const anchor = planningWorkflowId("artifact-run", timestamp, nonce).slice(0, 80);
  const suffixBudget = Math.max(0, 127 - anchor.length);
  const suffix = planningWorkflowId("artifact", input.planId, input.artifactPath)
    .replace(/^artifact-/, "")
    .slice(0, suffixBudget);
  return suffix ? `${anchor}-${suffix}` : anchor;
}

function artifactTitle(path: string): string {
  const parts = path.split(/[\\/]/g).filter(Boolean);
  return parts.at(-1) ?? path;
}

async function loadPlanPrototypeForArtifact(
  manager: EntityManager,
  planId: string,
  artifactPath: string,
  prototypeId?: string,
  artifactId?: string,
): Promise<FulcrumPlanPrototype | null> {
  if (prototypeId) {
    const prototype = await manager.getRepository(FulcrumPlanPrototypeEntity).findOneBy({
      id: prototypeId,
      planId,
    });
    if (!prototype) return null;
    if (prototype.outputRef === artifactPath) return prototype;
    if (prototype.artifactId) {
      const artifact = await manager.getRepository(FulcrumArtifactEntity).findOneBy({
        id: prototype.artifactId,
        bodyPath: artifactPath,
      });
      if (artifact) return prototype;
    }
    return null;
  }

  if (artifactId) {
    const prototype = await manager.getRepository(FulcrumPlanPrototypeEntity).findOneBy({
      planId,
      artifactId,
    });
    if (prototype) {
      if (prototype.outputRef === artifactPath) return prototype;
      const artifact = await manager.getRepository(FulcrumArtifactEntity).findOneBy({
        id: artifactId,
        bodyPath: artifactPath,
      });
      if (artifact) return prototype;
    }
  }

  const prototypes = await manager.getRepository(FulcrumPlanPrototypeEntity).find({
    where: { planId },
  });
  const byOutputRef = prototypes.find((prototype) => prototype.outputRef === artifactPath);
  if (byOutputRef) return byOutputRef;

  const artifacts = await manager.getRepository(FulcrumArtifactEntity).find({
    where: { bodyPath: artifactPath },
  });
  const artifactIds = new Set(artifacts.map((artifact) => artifact.id));
  return prototypes.find((prototype) => prototype.artifactId !== null && artifactIds.has(prototype.artifactId)) ?? null;
}

interface ResolvedArtifactRunPlan {
  prototype: FulcrumPlanPrototype;
  command?: string;
  args: string[];
  urlPath?: string;
  traceId?: string;
  checks: string[];
}

function buildArtifactRunPlan(
  prototype: FulcrumPlanPrototype,
  input: PlanningArtifactRunInput,
): ResolvedArtifactRunPlan {
  const metadata = prototype.metadata ?? {};
  const preview = objectRecord(metadata.preview);
  const previewRun = objectRecord(preview?.run);
  const command = trimmed(input.command) ?? stringProperty(previewRun, "command");
  const args = input.args
    ? normalizeStringArray(input.args)
    : normalizeStringArray(stringArrayProperty(previewRun, "args"));
  const checks = input.checks
    ? normalizeStringArray(input.checks)
    : normalizeStringArray(stringArrayProperty(preview, "reviewChecks"));
  const urlPath = trimmed(input.urlPath) ?? stringProperty(preview, "urlPath");
  const traceId = trimmed(input.traceId) ?? stringProperty(preview, "traceId") ?? stringProperty(metadata, "traceId");
  return {
    prototype,
    ...(command ? { command } : {}),
    args,
    ...(urlPath ? { urlPath } : {}),
    ...(traceId ? { traceId } : {}),
    checks,
  };
}

function artifactExecutionHistoryForPrototype(
  prototype: FulcrumPlanPrototype,
): PersistedPlanningArtifactExecutionRecord[] {
  const metadata = prototype.metadata ?? {};
  const executions = Array.isArray(metadata.executions) ? metadata.executions : [];
  return executions
    .map((entry) => persistedArtifactExecutionFromUnknown(entry, prototype))
    .filter((entry): entry is PersistedPlanningArtifactExecutionRecord => entry !== null);
}

function persistedArtifactExecutionFromUnknown(
  entry: unknown,
  prototype: FulcrumPlanPrototype,
): PersistedPlanningArtifactExecutionRecord | null {
  const record = objectRecord(entry);
  const planId = stringProperty(record, "planId");
  const artifactPath = stringProperty(record, "artifactPath");
  const status = stringProperty(record, "status");
  if (!planId || !artifactPath || !status) return null;
  try {
    const built = buildPlanningArtifactExecutionRecord({
      planId,
      artifactPath,
      status: status as PlanningArtifactExecutionInput["status"],
      prototypeId: stringProperty(record, "prototypeId") ?? prototype.id,
      artifactId: stringProperty(record, "artifactId") ?? prototype.artifactId ?? undefined,
      traceId: stringProperty(record, "traceId"),
      command: stringProperty(record, "command"),
      args: stringArrayProperty(record, "args"),
      urlPath: stringProperty(record, "urlPath"),
      summary: stringProperty(record, "summary"),
      outputRef: stringProperty(record, "outputRef"),
      checks: stringArrayProperty(record, "checks"),
      executedAt: stringProperty(record, "executedAt"),
    });
    return {
      ...built,
      prototypeId: prototype.id,
      artifactId: prototype.artifactId,
    };
  } catch {
    return null;
  }
}

function artifactCommandAgentProvider(command: string, args: readonly string[]): AgentProvider {
  return {
    name: "planning-artifact-command",
    env: {},
    captureSessions: false,
    buildPrintCommand: () => ({
      command: `${formatCommand(command, args)} && printf '\\nCOMPLETE\\n'`,
    }),
    parseStreamLine: (line) => [{ type: "text", text: line }],
  };
}

function summarizeArtifactRun(result: AgentRunResult): string {
  if (result.exitCode === 0 && result.exitReason === "complete") {
    return "Artifact command completed in the sandbox runner.";
  }
  return `Artifact command failed with exit code ${result.exitCode} and exit reason ${result.exitReason}.`;
}

function artifactRunErrorStatus(error: unknown): PlanningArtifactExecutionInput["status"] {
  return error instanceof SandboxProviderUnavailableError ? "blocked" : "failed";
}

function summarizeArtifactRunError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof SandboxProviderUnavailableError) {
    return `Artifact command was blocked by the sandbox runner: ${message}`;
  }
  return `Artifact command failed before completion: ${message}`;
}

function formatCommand(command: string, args: readonly string[]): string {
  return [command,...args].map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function normalizedPositiveInteger(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

function normalizeStringArray(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function stringArrayProperty(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function stringProperty(record: Record<string, unknown> | undefined, key: string): string | undefined {
  return trimmed(record?.[key]);
}

function trimmed(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function ensureWorkspaceProject(
  manager: EntityManager,
  input: PlanningProjectScopeInput,
  traceId: string,): Promise<void> {
  await manager.getRepository(FulcrumWorkspaceEntity).save({
    id: input.workspaceId,
    slug: input.workspaceSlug,
    name: input.workspaceName,
  });
  await manager.getRepository(FulcrumProjectEntity).save({
    id: input.projectId,
    workspaceId: input.workspaceId,
    slug: input.projectSlug,
    name: input.projectName,
    traceId,
  });
}

async function loadPlanningDocuments(
  manager: EntityManager,
  selectedDocIds: string[],
  projectId: string,): Promise<PlanningDocumentResult[]> {
  if (selectedDocIds.length === 0) {
    const rows = await manager.getRepository(FulcrumDocumentEntity).find({
      where: { projectId },
    });
    return rows.map(mapDocumentEntity);
  }

  const docs: PlanningDocumentResult[] = [];
  for (const id of selectedDocIds) {
    const row = await manager.getRepository(FulcrumDocumentEntity).findOneBy({ id, projectId });
    if (row) docs.push(mapDocumentEntity(row));
  }
  return docs;
}

function mapDocumentEntity(row: {
  id: string;
  projectId: string;
  title: string;
  bodyMd: string;
  parentId?: string | null;
  sourceType: string;
  traceId: string;
}): PlanningDocumentResult {
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId ?? null,
    title: row.title,
    bodyMd: row.bodyMd,
    sourceType: row.sourceType,
    traceId: row.traceId,
  };
}

function buildContextFromDocuments(
  documents: PlanningDocumentResult[],
  selectedDocIds: string[] | undefined,
  traceId: string,
  maxDocChars?: number,): FreeformPlanningContext {
  return buildFreeformDocsPlanningContext({
    docs: documents.map(mapDocumentToPlanningContextDoc),
    selectedDocIds,
    traceId,
    maxDocChars,
  });
}

function mapDocumentToPlanningContextDoc(doc: PlanningDocumentResult): FreeformPlanningContextDoc {
  return {
    id: doc.id,
    slugId: doc.id,
    title: doc.title,
    name: doc.title,
    bodyMd: doc.bodyMd,
    parentId: doc.parentId,
    sortPosition: doc.id,
    projectId: doc.projectId,
  };
}

async function persistContinuousChangedDocs(
  manager: EntityManager,
  input: PlanningContinuousUpdateInput,
  traceId: string,): Promise<PlanningDocumentResult[]> {
  const persisted: PlanningDocumentResult[] = [];
  for (const doc of input.changedDocs ?? []) {
    if (doc.id) {
      const existing = await manager.getRepository(FulcrumDocumentEntity).findOneBy({
        id: doc.id,
        projectId: input.projectId,
      });
      if (!existing) throw new Error(`Document not found: ${doc.id}`);
      const updated: PlanningDocumentResult = {
        id: existing.id,
        projectId: existing.projectId,
        parentId: existing.parentId ?? null,
        title: doc.title ?? existing.title,
        bodyMd: doc.bodyMd ?? existing.bodyMd,
        sourceType: "continuous_update_replan",
        traceId,
      };
      await manager.getRepository(FulcrumDocumentEntity).save(updated);
      persisted.push(updated);
      continue;
    }

    if (!doc.title?.trim()) {
      throw new Error("Changed document title is required when creating a new document.");
    }
    const created: PlanningDocumentResult = {
      id: planningWorkflowId("doc", traceId, doc.title),
      projectId: input.projectId,
      parentId: null,
      title: doc.title,
      bodyMd: doc.bodyMd ?? "",
      sourceType: "continuous_update_replan",
      traceId,
    };
    await manager.getRepository(FulcrumDocumentEntity).save(created);
    persisted.push(created);
  }
  return persisted;
}

async function loadContinuousTargetTaskContext(
  manager: EntityManager,
  projectId: string,
  targetTaskIds: string[],): Promise<{ tasks: ContinuousTargetTaskContext[]; missingTaskIds: string[] }> {
  const tasks: ContinuousTargetTaskContext[] = [];
  const missingTaskIds: string[] = [];
  for (const taskId of uniqueNonEmpty(targetTaskIds)) {
    const task = await manager.getRepository(FulcrumTaskEntity).findOneBy({ id: taskId, projectId });
    if (!task) {
      missingTaskIds.push(taskId);
      continue;
    }

    const blockedByDependencies = await manager.getRepository(FulcrumTaskDependencyEntity).find({
      where: { projectId, taskId },
    });
    const blocksDependencies = await manager.getRepository(FulcrumTaskDependencyEntity).find({
      where: { projectId, dependsOnTaskId: taskId },
    });
    const blockedByTaskIds = blockedByDependencies.map((dependency) => dependency.dependsOnTaskId);
    const blocksTaskIds = blocksDependencies.map((dependency) => dependency.taskId);
    tasks.push({
      id: task.id,
      title: task.title,
      status: task.status,
      successCriteria: task.successCriteria,
      blockedByTaskIds,
      blocksTaskIds,
      blockedByTasks: await loadTaskSummaries(manager, projectId, blockedByTaskIds),
      blocksTasks: await loadTaskSummaries(manager, projectId, blocksTaskIds),
    });
  }
  return { tasks, missingTaskIds };
}

async function loadTaskSummaries(
  manager: EntityManager,
  projectId: string,
  taskIds: string[],): Promise<Array<{ id: string; title: string; status: string }>> {
  const summaries = [];
  for (const id of taskIds) {
    const task = await manager.getRepository(FulcrumTaskEntity).findOneBy({ id, projectId });
    summaries.push({
      id,
      title: task?.title ?? "(missing task)",
      status: task?.status ?? "missing",
    });
  }
  return summaries;
}

function guidedAcpSessionAction(action: string): PlanningGuidedAcpSessionAction {
  switch (action) {
    case "resume_session":
    case "cancel_operation":
    case "resolve_permission":
    case "cancel_permission":
    case "set_mode":
    case "set_model":
      return action;
    default:
      throw new Error("action must be resume_session, cancel_operation, resolve_permission, cancel_permission, set_mode, or set_model.");
  }
}

function guidedAcpActionTraffic(input: {
  action: PlanningGuidedAcpSessionAction;
  acpSessionId: string;
  traceId: string;
  requestId: number;
  optionId?: string;
  modeId?: string;
  modelId?: string;
}): {
  entry: TrafficEntryInput;
  action: PlanningGuidedAcpSessionActionResult["action"];
} {
  const basePayload = { acpSessionId: input.acpSessionId, traceId: input.traceId };
  switch (input.action) {
    case "resume_session":
      return {
        entry: {
          direction: "out",
          type: "request",
          method: "session/load",
          requestId: input.requestId,
          payload: basePayload,
        },
        action: { type: input.action, method: "session/load" },
      };
    case "cancel_operation":
      return {
        entry: {
          direction: "out",
          type: "notification",
          method: "session/cancel",
          payload: basePayload,
        },
        action: { type: input.action, method: "session/cancel" },
      };
    case "resolve_permission": {
      const optionId = requiredActionValue(input.optionId, "optionId");
      return {
        entry: {
          direction: "out",
          type: "response",
          method: "session/request_permission",
          requestId: input.requestId,
          payload: { ...basePayload, outcome: { outcome: "selected", optionId } },
        },
        action: { type: input.action, method: "session/request_permission", optionId },
      };
    }
    case "cancel_permission":
      return {
        entry: {
          direction: "out",
          type: "response",
          method: "session/request_permission",
          requestId: input.requestId,
          payload: { ...basePayload, outcome: { outcome: "cancelled" } },
        },
        action: { type: input.action, method: "session/request_permission" },
      };
    case "set_mode": {
      const modeId = requiredActionValue(input.modeId, "modeId");
      return {
        entry: {
          direction: "out",
          type: "request",
          method: "session/set_mode",
          requestId: input.requestId,
          payload: { ...basePayload, modeId },
        },
        action: { type: input.action, method: "session/set_mode", modeId },
      };
    }
    case "set_model": {
      const modelId = requiredActionValue(input.modelId, "modelId");
      return {
        entry: {
          direction: "out",
          type: "request",
          method: "session/set_model",
          requestId: input.requestId,
          payload: { ...basePayload, modelId },
        },
        action: { type: input.action, method: "session/set_model", modelId },
      };
    }
  }
}

function guidedAcpSessionStatus(action: PlanningGuidedAcpSessionAction): string {
  switch (action) {
    case "resume_session":
      return "resuming_session";
    case "cancel_operation":
      return "operation_cancelled";
    case "resolve_permission":
      return "permission_resolved";
    case "cancel_permission":
      return "permission_cancelled";
    case "set_mode":
    case "set_model":
      return "selector_updated";
  }
}

function requiredActionValue(value: string | undefined, key: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${key} is required for this ACP session action.`);
  return trimmed;
}

function normalizeTrafficLog(value: unknown): TrafficEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const entry = candidate as Partial<TrafficEntry> | null;
    if (!entry || typeof entry !== "object") return [];
    if (entry.direction !== "in" && entry.direction !== "out") return [];
    if (entry.type !== "request" && entry.type !== "response" && entry.type !== "notification") return [];
    if (typeof entry.method !== "string" || !entry.method) return [];
    return [{
      id: typeof entry.id === "string" ? entry.id : "",
      timestamp: typeof entry.timestamp === "number" ? entry.timestamp : 0,
      direction: entry.direction,
      type: entry.type,
      method: entry.method,
      requestId: entry.requestId,
      payload: entry.payload,
      ...(entry.error === true ? { error: true } : {}),
    }];
  });
}

function toTrafficInput(entry: TrafficEntry): TrafficEntryInput {
  return {
    direction: entry.direction,
    type: entry.type,
    method: entry.method,
    requestId: entry.requestId,
    payload: entry.payload,
    ...(entry.error === true ? { error: true } : {}),
  };
}

async function updateContinuousAcpSession(
  manager: EntityManager,
  input: PlanningContinuousUpdateInput,
  traceId: string,
  context: FreeformPlanningContext,
  prompt: string,): Promise<{ entries: TrafficEntry[] }> {
  if (!input.acpSessionId) return { entries: [] };

  const existing = await manager.getRepository(FulcrumAcpSessionEntity).findOneBy({ id: input.acpSessionId });
  const priorTraffic = Array.isArray(existing?.trafficLog) ? existing.trafficLog as TrafficEntry[] : [];
  const traffic = createInMemoryTrafficRecorder();
  for (const entry of priorTraffic) traffic.addEntry(entry);
  const nextRequestId = priorTraffic.length + 1;
  traffic.addEntry({
    direction: "out",
    type: "request",
    method: "session/update",
    requestId: nextRequestId,
    payload: {
      acpSessionId: input.acpSessionId,
      trigger: input.trigger,
      traceId,
      changedDocIds: input.changedDocs?.map((doc) => doc.id ?? doc.title).filter(Boolean) ?? [],
      selectedDocIds: context.sourceRefs.map((ref) => ref.id),
    },
  });
  traffic.addEntry({
    direction: "out",
    type: "request",
    method: "session/prompt",
    requestId: nextRequestId + 1,
    payload: {
      acpSessionId: input.acpSessionId,
      traceId,
      sourceRefs: context.sourceRefs,
      prompt,
    },
  });

  await manager.getRepository(FulcrumAcpSessionEntity).save({
    id: input.acpSessionId,
    projectId: input.projectId,
    traceId,
    agentName: existing?.agentName ?? "unknown",
    mode: input.modeId ?? existing?.mode ?? "planning",
    model: input.modelId ?? existing?.model ?? null,
    status: "ready_for_replanning",
    trafficLog: traffic.entries,
  });
  return { entries: traffic.entries };
}

function appendContinuousUpdateInstructions(
  prompt: string,
  input: PlanningContinuousUpdateInput,
  selectedDocIds: string[],
  taskContext: { tasks: ContinuousTargetTaskContext[]; missingTaskIds: string[] },): string {
  return [
    prompt,
    "",
    "## Continuous update / replanning cycle",
    "Continue the Fulcrum workflow cycle from the updated context instead of starting from scratch.",
    `- Trigger: ${input.trigger}`,
    input.traceId ? `- Trace ID: ${input.traceId}` : null,
    input.acpSessionId ? `- ACP session: ${input.acpSessionId}` : null,
    input.modeId ? `- ACP mode: ${input.modeId}` : null,
    input.modelId ? `- ACP model: ${input.modelId}` : null,
    selectedDocIds.length ? `- Source docs: ${selectedDocIds.join(", ")}` : null,
    input.targetTaskIds?.length ? `- Existing tasks to reconcile: ${input.targetTaskIds.join(", ")}` : null,
    taskContext.tasks.length ? formatContinuousTargetTaskContext(taskContext.tasks) : null,
    taskContext.missingTaskIds.length ? `- Missing target task IDs: ${taskContext.missingTaskIds.join(", ")}` : null,
    "",
    "Update docs, prototype/boilerplate expectations, task breakdown, dependencies, and success criteria only where the changed context requires it. Preserve approved work that still satisfies the new context.",
  ].filter((line): line is string => line !== null).join("\n");
}

function formatContinuousTargetTaskContext(tasks: ContinuousTargetTaskContext[]): string {
  return [
    "### Target task context",...tasks.map((task) => [
      `- ${task.title} (${task.id})`,
      `  Status: ${task.status}`,
      task.successCriteria.length ? `  Success criteria: ${task.successCriteria.join("; ")}` : null,
      task.blockedByTasks.length ? `  Blocked by: ${formatTaskSummaries(task.blockedByTasks)}` : null,
      task.blocksTasks.length ? `  Blocks: ${formatTaskSummaries(task.blocksTasks)}` : null,
    ].filter((line): line is string => line !== null).join("\n")),
  ].join("\n");
}

function appendGuidedAcpInstructions(
  prompt: string,
  session: PlanningGuidedAcpSession,): string {
  return [
    prompt,
    "",
    "## ACP guided session",
    `- Agent: ${session.agentName}`,
    `- CWD: ${session.cwd}`,
    `- Mode: ${session.modeId}`,
    session.modelId ? `- Model: ${session.modelId}` : null,
    `- Prompt template: ${session.promptTemplateId}`,
    `- Permission mode: ${session.permissionMode}`,
    "",
    "Use the selected docs as context, request permissions before tool use, keep traffic visible, and submit the technical plan through submit_plan.",
  ].filter((line): line is string => line !== null).join("\n");
}

function formatTaskSummaries(tasks: Array<{ id: string; title: string; status: string }>): string {
  return tasks.map((task) => `${task.title} (${task.id}, ${task.status})`).join("; ");
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

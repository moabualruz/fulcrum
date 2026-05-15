import "reflect-metadata";

import { Inject, Injectable } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";

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
import { createInMemoryTrafficRecorder, type TrafficEntry } from "@agent-client-protocol/application/traffic";

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

export interface PersistedPlanningArtifactExecutionRecord extends PlanningArtifactExecutionRecord {
  prototypeId: string;
  artifactId?: string | null;
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
    if (!prototype) return null;
    if (prototype.outputRef === artifactPath) return prototype;
    const artifact = await manager.getRepository(FulcrumArtifactEntity).findOneBy({
      id: artifactId,
      bodyPath: artifactPath,
    });
    if (artifact) return prototype;
    return null;
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

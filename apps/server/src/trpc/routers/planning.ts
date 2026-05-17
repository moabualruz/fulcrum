import { z } from "zod";

import {
  materializeApprovedPlanBreakdown,
  previewApprovedPlanBreakdown,
} from "@planning-review/application/approved-plan-actions.ts";
import { startGuidedAcpPlanningSession } from "@planning-review/application/acp-guided-planning-actions.ts";
import { restartPlanningCycleFromUpdates } from "@planning-review/application/continuous-update-actions.ts";
import { buildFreeformPlanningPromptFromDocs } from "@planning-review/application/freeform-doc-actions.ts";
import { startFreeformWorkFromDocs } from "@planning-review/application/freeform-doc-actions.ts";
import { generateTechnicalPlanningCycle } from "@planning-review/application/technical-planning-cycle.ts";
import { appErrorToTrpcError } from "@fulcrum/server/trpc/error-mapping.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import { CreateTaskInputSchema } from "@work-management/application/tasks/schema.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";
import { requireTrpcEntityManager } from "@fulcrum/server/trpc/context.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const DocSourceRefSchema = z.object({
  kind: z.string().trim().min(1),
  id: z.string().trim().min(1),
}).strict();

const DocSourceLinkSchema = DocSourceRefSchema.extend({
  targetKind: z.string().trim().min(1).optional(),
  targetId: z.string().trim().min(1).optional(),
  linkKind: z.enum(["task_ref", "run_ref", "mention", "wikilink"]).optional(),
}).strict();

const ApprovedPlanInputSchema = z.object({
  planId: z.string().trim().min(1),
  approvedPlanMarkdown: z.string().min(1),
  traceId: z.string().trim().min(1).optional(),
  reviewId: z.string().trim().min(1).optional(),
  projectId: z.uuid().nullable().optional(),
  cycleId: z.string().trim().min(1).nullable().optional(),
  moduleId: z.string().trim().min(1).nullable().optional(),
  sourceDocRefs: z.array(DocSourceRefSchema).max(100).optional(),
}).strict();

const FreeformPlanningPromptInputSchema = z.object({
  userPrompt: z.string().trim().min(1),
  selectedDocIds: z.array(z.uuid()).max(100).optional(),
  traceId: z.string().trim().min(1).optional(),
  projectId: z.uuid().nullable().optional(),
  maxDocChars: z.number().int().positive().max(100_000).optional(),
}).strict();

const StartFreeformWorkInputSchema = z.object({
  title: z.string().trim().min(1),
  bodyMd: z.string().min(1),
  userPrompt: z.string().trim().min(1),
  projectId: z.uuid().nullable().optional(),
  parentId: z.uuid().nullable().optional(),
  traceId: z.string().trim().min(1).optional(),
  acpSessionId: z.string().trim().min(1).optional(),
  modeId: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).optional(),
  maxDocChars: z.number().int().positive().max(100_000).optional(),
}).strict();

const StartGuidedAcpPlanningInputSchema = z.object({
  acpSessionId: z.string().trim().min(1).optional(),
  agentName: z.string().trim().min(1),
  cwd: z.string().trim().min(1),
  userPrompt: z.string().trim().min(1),
  promptTemplateId: z.string().trim().min(1).optional(),
  selectedDocIds: z.array(z.uuid()).max(100).optional(),
  projectId: z.uuid().nullable().optional(),
  traceId: z.string().trim().min(1).optional(),
  modeId: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).optional(),
  permissionMode: z.enum(["review_each_tool", "allow_workspace", "read_only"]).optional(),
  maxDocChars: z.number().int().positive().max(100_000).optional(),
}).strict();

const ContinuousUpdateChangedDocInputSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).optional(),
  bodyMd: z.string().optional(),
  parentId: z.uuid().nullable().optional(),
}).strict();

const RestartPlanningCycleFromUpdatesInputSchema = z.object({
  trigger: z.enum(["manual_doc_edit", "acp_session_update"]),
  userPrompt: z.string().trim().min(1),
  projectId: z.uuid().nullable().optional(),
  traceId: z.string().trim().min(1).optional(),
  acpSessionId: z.string().trim().min(1).optional(),
  modeId: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).optional(),
  selectedDocIds: z.array(z.uuid()).max(100).optional(),
  targetTaskIds: z.array(z.string().trim().min(1)).max(500).optional(),
  changedDocs: z.array(ContinuousUpdateChangedDocInputSchema).max(20).optional(),
  maxDocChars: z.number().int().positive().max(100_000).optional(),
}).strict();

const TechnicalPlanningTaskSeedInputSchema = z.object({
  clientKey: z.string().trim().min(1),
  title: z.string().trim().min(1),
  dependsOn: z.array(z.string().trim().min(1)).max(100).optional(),
  success: z.string().trim().min(1).optional(),
}).strict();

const GenerateTechnicalPlanningCycleInputSchema = z.object({
  source: z.enum(["freeform_docs", "guided_acp", "continuous_update"]),
  userPrompt: z.string().trim().min(1),
  selectedDocIds: z.array(z.uuid()).max(100).optional(),
  traceId: z.string().trim().min(1).optional(),
  projectId: z.uuid().nullable().optional(),
  maxDocChars: z.number().int().positive().max(100_000).optional(),
  planId: z.string().trim().min(1).optional(),
  reviewId: z.string().trim().min(1).optional(),
  prototypePaths: z.array(z.string().trim().min(1)).max(50).optional(),
  boilerplatePaths: z.array(z.string().trim().min(1)).max(50).optional(),
  successCriteria: z.array(z.string().trim().min(1)).max(100).optional(),
  taskSeeds: z.array(TechnicalPlanningTaskSeedInputSchema).max(100).optional(),
}).strict();

const FreeformPlanningSourceRefSchema = z.object({
  kind: z.literal("doc"),
  id: z.string(),
}).strict();

const FreeformPlanningSelectedDocSchema = z.object({
  id: z.string(),
  title: z.string(),
  breadcrumb: z.string(),
  bodyMd: z.string(),
  versionId: z.string().optional(),
  updatedAt: z.string().optional(),
  truncated: z.boolean(),
}).strict();

const FreeformPlanningContextSchema = z.object({
  traceId: z.string().optional(),
  sourceRefs: z.array(FreeformPlanningSourceRefSchema),
  selectedDocs: z.array(FreeformPlanningSelectedDocSchema),
  contextMarkdown: z.string(),
}).strict();

const FreeformPlanningPromptOutputSchema = z.object({
  context: FreeformPlanningContextSchema,
  prompt: z.string(),
}).strict();

const FreeformWorkDocumentSchema = z.object({
  id: z.uuid(),
  orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  title: z.string(),
  slug: z.string(),
  parentId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  scope: z.string(),
  docType: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  bodyMd: z.string(),
  contentJson: z.record(z.string(), z.unknown()),
  sortPosition: z.number(),
  archived: z.boolean(),
  externalId: z.string().nullable(),
  updatedAt: z.date(),
}).strict();

const StartFreeformWorkOutputSchema = FreeformPlanningPromptOutputSchema.extend({
  status: z.literal("ready_for_planning"),
  eventId: z.string(),
  document: FreeformWorkDocumentSchema,
}).strict();

const GuidedAcpSessionModeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
}).strict();

const GuidedAcpModelSchema = z.object({
  modelId: z.string(),
  name: z.string(),
  description: z.string().optional(),
}).strict();

const GuidedAcpPermissionOptionSchema = z.object({
  optionId: z.string(),
  kind: z.string(),
  name: z.string(),
}).strict();

const GuidedAcpTrafficEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  direction: z.enum(["in", "out"]),
  type: z.enum(["request", "response", "notification"]),
  method: z.string(),
  requestId: z.union([z.number(), z.string()]).optional(),
  payload: z.unknown(),
  error: z.boolean().optional(),
}).strict();

const GuidedAcpPlanningSessionSchema = z.object({
  acpSessionId: z.string(),
  agentName: z.string(),
  cwd: z.string(),
  promptTemplateId: z.string(),
  projectId: z.uuid().nullable().optional(),
  traceId: z.string().optional(),
  modeId: z.string(),
  modelId: z.string().optional(),
  permissionMode: z.enum(["review_each_tool", "allow_workspace", "read_only"]),
  availableModes: z.array(GuidedAcpSessionModeSchema),
  availableModels: z.array(GuidedAcpModelSchema),
}).strict();

const StartGuidedAcpPlanningOutputSchema = FreeformPlanningPromptOutputSchema.extend({
  status: z.literal("ready_for_acp_prompt"),
  eventId: z.string(),
  session: GuidedAcpPlanningSessionSchema,
  permissionOptions: z.array(GuidedAcpPermissionOptionSchema),
  traffic: z.object({
    entries: z.array(GuidedAcpTrafficEntrySchema),
  }).strict(),
}).strict();

const RestartPlanningCycleFromUpdatesOutputSchema = FreeformPlanningPromptOutputSchema.extend({
  status: z.literal("ready_for_replanning"),
  eventId: z.string(),
  trigger: z.enum(["manual_doc_edit", "acp_session_update"]),
  traceId: z.string().optional(),
  acpSessionId: z.string().optional(),
  modeId: z.string().optional(),
  modelId: z.string().optional(),
  targetTaskIds: z.array(z.string()),
  targetTasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    status: z.string().nullable(),
    descriptionText: z.string(),
    blockedByTaskIds: z.array(z.string()),
    blocksTaskIds: z.array(z.string()),
    blockedByTasks: z.array(z.object({
      id: z.string(),
      title: z.string(),
      status: z.string().nullable(),
    }).strict()),
    blocksTasks: z.array(z.object({
      id: z.string(),
      title: z.string(),
      status: z.string().nullable(),
    }).strict()),
  }).strict()).optional(),
  missingTargetTaskIds: z.array(z.string()).optional(),
  changedDocs: z.array(FreeformWorkDocumentSchema),
}).strict();

const ApprovedPlanArtifactSchema = z.object({
  kind: z.enum(["prototype", "boilerplate"]),
  path: z.string(),
  title: z.string(),
  traceId: z.string().optional(),
  sourcePlanId: z.string(),
}).strict();

const ApprovedPlanSuccessCriterionSchema = z.object({
  id: z.string(),
  text: z.string(),
  scope: z.enum(["plan", "task"]),
  traceId: z.string().optional(),
  taskClientKey: z.string().optional(),
}).strict();

const ApprovedPlanDocDraftSchema = z.object({
  clientKey: z.string(),
  input: z.object({
    title: z.string(),
    parentId: z.string().nullable().optional(),
    bodyMd: z.string().optional(),
    projectId: z.uuid().nullable().optional(),
    scope: z.string().optional(),
    docType: z.string().optional(),
    frontmatter: z.record(z.string(), z.unknown()).optional(),
    contentJson: z.record(z.string(), z.unknown()).optional(),
    sortPosition: z.number().optional(),
    source: DocSourceRefSchema.optional(),
    links: z.array(DocSourceLinkSchema).optional(),
  }).strict(),
}).strict();

const ApprovedPlanTaskDraftSchema = z.object({
  clientKey: z.string(),
  input: CreateTaskInputSchema,
  blockedByClientKeys: z.array(z.string()),
  successCriteria: z.array(ApprovedPlanSuccessCriterionSchema),
  artifactPaths: z.array(z.string()),
  sourcePlanId: z.string(),
  traceId: z.string().optional(),
}).strict();

const ApprovedPlanDependencyUpdateSchema = z.object({
  taskClientKey: z.string(),
  blockedByClientKeys: z.array(z.string()),
}).strict();

const ApprovedPlanBreakdownSchema = z.object({
  title: z.string(),
  docs: z.array(ApprovedPlanDocDraftSchema),
  artifacts: z.array(ApprovedPlanArtifactSchema),
  successCriteria: z.array(ApprovedPlanSuccessCriterionSchema),
  taskDrafts: z.array(ApprovedPlanTaskDraftSchema),
  dependencyUpdates: z.array(ApprovedPlanDependencyUpdateSchema),
  warnings: z.array(z.string()),
}).strict();

const ApprovedPlanMaterializedDocSchema = z.object({
  clientKey: z.string(),
  id: z.string(),
}).strict();

const ApprovedPlanMaterializedArtifactSchema = z.object({
  id: z.string(),
  kind: z.enum(["prototype", "boilerplate"]),
  path: z.string(),
  title: z.string(),
  traceId: z.string().optional(),
  sourcePlanId: z.string(),
}).strict();

const ApprovedPlanMaterializedTaskSchema = z.object({
  clientKey: z.string(),
  id: z.string(),
}).strict();

const ApprovedPlanMaterializedDependencyUpdateSchema = z.object({
  taskClientKey: z.string(),
  taskId: z.string(),
  blockedByClientKeys: z.array(z.string()),
  blockedByTaskIds: z.array(z.string()),
}).strict();

const ApprovedPlanMaterializationSchema = z.object({
  docs: z.array(ApprovedPlanMaterializedDocSchema),
  artifacts: z.array(ApprovedPlanMaterializedArtifactSchema),
  tasks: z.array(ApprovedPlanMaterializedTaskSchema),
  dependencyUpdates: z.array(ApprovedPlanMaterializedDependencyUpdateSchema),
}).strict();

const ApprovedPlanMaterializeResultSchema = z.object({
  breakdown: ApprovedPlanBreakdownSchema,
  materialization: ApprovedPlanMaterializationSchema,
}).strict();

const TechnicalPlanningPlanSchema = z.object({
  planId: z.string(),
  reviewId: z.string().optional(),
  title: z.string(),
  traceId: z.string().optional(),
  source: z.enum(["freeform_docs", "guided_acp", "continuous_update"]),
  markdown: z.string(),
  prototypePaths: z.array(z.string()),
  boilerplatePaths: z.array(z.string()),
  sourceDocRefs: z.array(FreeformPlanningSourceRefSchema),
}).strict();

const GenerateTechnicalPlanningCycleOutputSchema = FreeformPlanningPromptOutputSchema.extend({
  status: z.literal("ready_for_plan_review"),
  eventId: z.string(),
  reviewPrompt: z.string(),
  plan: TechnicalPlanningPlanSchema,
  breakdown: ApprovedPlanBreakdownSchema,
}).strict();

const planningApplication = {
  previewApprovedPlanBreakdown,
  materializeApprovedPlanBreakdown,
  buildFreeformPlanningPromptFromDocs,
  startFreeformWorkFromDocs,
  startGuidedAcpPlanningSession,
  restartPlanningCycleFromUpdates,
  generateTechnicalPlanningCycle,
};

export function __setPlanningApplicationForTest(overrides: Partial<typeof planningApplication>): () => void {
  const previous = { ...planningApplication };
  Object.assign(planningApplication, overrides);
  return () => Object.assign(planningApplication, previous);
}

function appContext(ctx: { orgId: string; userId: string }, projectId?: string | null): AppContext {
  return { orgId: ctx.orgId, userId: ctx.userId, projectId: projectId ?? null };
}

async function mapAppError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

export const planningRouter = t.router({
  startGuidedAcpPlanningSession: permissionedProcedure({
    resource: "planning",
    action: "startGuidedAcpPlanningSession",
  })
    .input(StartGuidedAcpPlanningInputSchema)
    .output(StartGuidedAcpPlanningOutputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() =>
        planningApplication.startGuidedAcpPlanningSession(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        )
      )
    ),

  startFreeformWorkFromDocs: permissionedProcedure({
    resource: "planning",
    action: "startFreeformWorkFromDocs",
  })
    .input(StartFreeformWorkInputSchema)
    .output(StartFreeformWorkOutputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() =>
        planningApplication.startFreeformWorkFromDocs(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        )
      )
    ),

  buildFreeformDocsPlanningPrompt: permissionedProcedure({
    resource: "planning",
    action: "buildFreeformDocsPlanningPrompt",
  })
    .input(FreeformPlanningPromptInputSchema)
    .output(FreeformPlanningPromptOutputSchema)
    .query(({ ctx, input }) =>
      mapAppError(() =>
        planningApplication.buildFreeformPlanningPromptFromDocs(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        )
      )
    ),

  restartPlanningCycleFromUpdates: permissionedProcedure({
    resource: "planning",
    action: "restartPlanningCycleFromUpdates",
  })
    .input(RestartPlanningCycleFromUpdatesInputSchema)
    .output(RestartPlanningCycleFromUpdatesOutputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() =>
        planningApplication.restartPlanningCycleFromUpdates(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        )
      )
    ),

  generateTechnicalPlanningCycle: permissionedProcedure({
    resource: "planning",
    action: "generateTechnicalPlanningCycle",
  })
    .input(GenerateTechnicalPlanningCycleInputSchema)
    .output(GenerateTechnicalPlanningCycleOutputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() =>
        planningApplication.generateTechnicalPlanningCycle(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        )
      )
    ),

  previewApprovedPlanBreakdown: permissionedProcedure({ resource: "planning", action: "previewApprovedPlanBreakdown" })
    .input(ApprovedPlanInputSchema)
    .output(ApprovedPlanBreakdownSchema)
    .query(({ input }) => mapAppError(() => planningApplication.previewApprovedPlanBreakdown(input))),

  materializeApprovedPlanBreakdown: permissionedProcedure({
    resource: "planning",
    action: "materializeApprovedPlanBreakdown",
  })
    .input(ApprovedPlanInputSchema)
    .output(ApprovedPlanMaterializeResultSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() =>
        planningApplication.materializeApprovedPlanBreakdown(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        )
      )
    ),
});

export type PlanningRouter = typeof planningRouter;

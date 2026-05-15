/**
 * workflowsRouter — task workflow.
 *
 * tRPC adapter for workflow transition validation, methodology,
 * enabled task types.
 *
 * Security: permissionedProcedure enforces session + org scope.
 * Transitions mutation gated to "workflows.update" (T-05-08).
 */

import { z } from "zod";

import {
  updateEnabledTaskTypes,
  updateMethodology,
  updateTransitions,
} from "@work-management/application/workflows/commands.ts";
import {
  getDefaultWorkflow,
  getEnabledTaskTypes,
  getMethodology,
  getTransitions,
  validateTransition,
  type Methodology,
  type WorkflowAppContext,
} from "@work-management/application/workflows/queries.ts";
import { appErrorToTrpcError } from "@fulcrum/server/trpc/error-mapping.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import {
  createFulcrumTypeOrmManagedDataSource,
  type FulcrumTypeOrmManagedDataSource,
} from "@platform-core/infrastructure/database/typeorm-connection-runtime.ts";
import {
  FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
} from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import {
  FULCRUM_REVIEW_WORKFLOW_ENTITIES,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import {
  WorkflowAcceptanceCycleService,
  type WorkflowAcceptanceCycleInput,
  type WorkflowAcceptanceCycleResult,
} from "@workflow-coordination/application/workflow-acceptance-cycle.ts";
import {
  FULCRUM_WORKFLOW_SPINE_ENTITIES,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

// ── Schemas ────────────────────────────────────────────────────────────────────

const MethodologySchema = z.enum(["scrum", "kanban", "none"]);
const TaskTypeSchema = z.enum(["epic", "task", "subtask", "bug"]);
const RequiredStringSchema = z.string().trim().min(1);
const PermissionModeSchema = z.enum(["review_each_tool", "allow_workspace", "read_only"]);
const QaReviewTypeSchema = z.enum(["plan", "code", "spec"]);
const ReviewTypeSchema = z.enum(["uat", "code_review"]);
const E2eRunnerSchema = z.enum(["bun", "playwright"]);
const WorkflowAcceptanceCycleInputSchema = z.object({
  workspace: z.object({
    id: RequiredStringSchema,
    slug: RequiredStringSchema,
    name: RequiredStringSchema,
  }).strict(),
  project: z.object({
    id: RequiredStringSchema,
    slug: RequiredStringSchema,
    name: RequiredStringSchema,
    traceId: RequiredStringSchema,
  }).strict(),
  freeform: z.object({
    documentId: RequiredStringSchema,
    title: RequiredStringSchema,
    bodyMd: z.string().min(1),
    userPrompt: RequiredStringSchema,
  }).strict(),
  guidedPlanning: z.object({
    acpSessionId: RequiredStringSchema,
    agentName: RequiredStringSchema,
    cwd: RequiredStringSchema,
    modeId: RequiredStringSchema.optional(),
    modelId: RequiredStringSchema.optional(),
    permissionMode: PermissionModeSchema.optional(),
  }).strict(),
  approvedPlan: z.object({
    planId: RequiredStringSchema,
    reviewId: RequiredStringSchema,
    markdown: z.string().min(1),
  }).strict(),
  execution: z.object({
    agent: RequiredStringSchema,
    model: RequiredStringSchema.optional(),
    prompt: RequiredStringSchema,
    lifecycleSummary: RequiredStringSchema,
    qaReviewText: RequiredStringSchema,
    qaReviewType: QaReviewTypeSchema.optional(),
  }).strict(),
  uat: z.object({
    decision: z.enum(["start_uat", "start_code_review", "request_changes", "approve_without_manual_review"]),
    reviewType: ReviewTypeSchema,
    feedbackText: z.string().optional(),
    e2eRunner: E2eRunnerSchema.optional(),
  }).strict(),
}).strict();

const WorkflowAcceptanceCycleOutputSchema = z.custom<WorkflowAcceptanceCycleResult>((value) => {
  const result = value as Partial<WorkflowAcceptanceCycleResult> | null;
  return Boolean(
    result &&
    typeof result === "object" &&
    typeof result.traceId === "string" &&
    (!result.finalQa || typeof result.finalQa.status === "string") &&
    (!result.generatedE2e || Array.isArray(result.generatedE2e.testFiles)),
  );
}, "Workflow acceptance cycle result is invalid.");
type EntityManager = import("typeorm").EntityManager;

interface WorkflowsApplication {
  runAcceptanceCycle(input: WorkflowAcceptanceCycleInput): Promise<WorkflowAcceptanceCycleResult>;
}

function requireEntityManager(em: EntityManager | null): EntityManager {
  if (!em) throw new Error("No entity manager");
  return em;
}

function appContext(ctx: { orgId: string; userId: string }): WorkflowAppContext {
  return { orgId: ctx.orgId, userId: ctx.userId };
}

async function mapAppError<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

async function createWorkflowDataSource(): Promise<FulcrumTypeOrmManagedDataSource> {
  return createFulcrumTypeOrmManagedDataSource({
    entities: [
      ...FULCRUM_WORKFLOW_SPINE_ENTITIES,
      ...FULCRUM_REVIEW_WORKFLOW_ENTITIES,
      ...FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES,
    ],
  });
}

async function runAcceptanceCycle(input: WorkflowAcceptanceCycleInput): Promise<WorkflowAcceptanceCycleResult> {
  const { dataSource, close } = await createWorkflowDataSource();
  await dataSource.initialize();
  try {
    return await new WorkflowAcceptanceCycleService(dataSource).runCycle(input);
  } finally {
    await close();
  }
}

const workflowsApplication: WorkflowsApplication = {
  runAcceptanceCycle,
};

export function __setWorkflowsApplicationForTest(overrides: Partial<WorkflowsApplication>): () => void {
  const previous = { ...workflowsApplication };
  Object.assign(workflowsApplication, overrides);
  return () => Object.assign(workflowsApplication, previous);
}

// ── Router ─────────────────────────────────────────────────────────────────────

export const workflowsRouter = t.router({
  runAcceptanceCycle: permissionedProcedure({ resource: "workflows", action: "runAcceptanceCycle" })
    .input(WorkflowAcceptanceCycleInputSchema)
    .output(WorkflowAcceptanceCycleOutputSchema)
    .mutation(async ({ input }) => {
      return mapAppError(() => workflowsApplication.runAcceptanceCycle(input));
    }),

  getTransitions: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => getTransitions(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  updateTransitions: permissionedProcedure({ resource: "workflows", action: "update" })
    .input(z.object({
      projectId: z.string().uuid(),
      transitions: z.record(z.string(), z.array(z.string())),
    }))
    .mutation(async ({ ctx, input }) => {
      await mapAppError(() => updateTransitions(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  validateTransition: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({
      projectId: z.string().uuid(),
      fromStatus: z.string(),
      toStatus: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => validateTransition(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  getDefault: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({
      methodology: MethodologySchema.optional().default("kanban"),
    }))
    .query(({ input }) => {
      return getDefaultWorkflow(input.methodology);
    }),

  getMethodology: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => getMethodology(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  updateMethodology: permissionedProcedure({ resource: "workflows", action: "update" })
    .input(z.object({
      projectId: z.string().uuid(),
      methodology: MethodologySchema,
      resetWorkflow: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      await mapAppError(() => updateMethodology(requireEntityManager(ctx["em"]), appContext(ctx), {
        ...input,
        methodology: input.methodology as Methodology,
      }));
    }),

  getEnabledTaskTypes: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => getEnabledTaskTypes(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  updateEnabledTaskTypes: permissionedProcedure({ resource: "workflows", action: "update" })
    .input(z.object({
      projectId: z.string().uuid(),
      types: z.array(TaskTypeSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      await mapAppError(() => updateEnabledTaskTypes(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),
});

export type WorkflowsRouter = typeof workflowsRouter;

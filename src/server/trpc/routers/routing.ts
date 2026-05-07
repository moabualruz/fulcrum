import { z } from "zod";

import {
  approveRoutingDraft,
  createRoutingRule,
  deleteRoutingDraft,
  deleteRoutingRule,
  dryRunRoutingRule,
  getRoutingRule,
  listRoutingDrafts,
  listRoutingRules,
  testRoutingRule,
  updateLlmGateConfig,
  updateRoutingDraft,
  updateRoutingRule,
} from "../../../application/routing.ts";
import { appErrorToTrpcError } from "../../../application/error-mapping.ts";
import { AppError } from "../../../application/errors.ts";
import { RoutingRuleSource } from "../../../db/entities/router/RoutingRule.ts";
import { requireTrpcEntityManager } from "../../../trpc/context.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

const UuidLikeSchema = z.string().regex(/^[0-9a-fA-F-]{36}$/);
const ConditionsSchema = z.record(z.string(), z.unknown());

const RoutingRuleSourceSchema = z.enum([
  RoutingRuleSource.Manual,
  RoutingRuleSource.Learned,
  RoutingRuleSource.Imported,
]);

const RoutingRuleOutputSchema = z.object({
  id: UuidLikeSchema,
  orgId: UuidLikeSchema,
  projectId: UuidLikeSchema.nullable(),
  name: z.string(),
  conditionsJson: ConditionsSchema,
  actionAgent: z.string(),
  actionSkillSet: z.array(z.string()),
  priority: z.number().int(),
  enabled: z.boolean(),
  source: RoutingRuleSourceSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

const RoutingResultStatusEnum = z.enum([
  "matched",
  "no_match",
  "recommended",
  "draft_created",
  "conflict",
  "abstained",
]);

const RoutingEnrichedOutputSchema = z.object({
  status: RoutingResultStatusEnum,
  matchedRuleId: z.string().nullable(),
  draftId: z.string().nullable().default(null),
  factsUsed: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().nullable(),
  backend: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  whyUnmatched: z.string().nullable().default(null),
  evidence: z.array(z.string()).default([]),
});

const DraftListInputSchema = z.object({
  orgId: UuidLikeSchema.optional(),
  status: z.string().optional(),
}).optional();

const DraftApproveInputSchema = z.object({ draftId: UuidLikeSchema });
const DraftDeleteInputSchema = z.object({ draftId: UuidLikeSchema });
const DraftUpdateInputSchema = z.object({
  draftId: UuidLikeSchema,
  conditionsJson: ConditionsSchema.optional(),
  actionAgent: z.string().optional(),
  actionSkillSet: z.array(z.string()).optional(),
});

const LlmGateUpdateSchema = z.object({
  inputMode: z.enum(["task_facts", "task_plus_history", "full_context"]).optional(),
  enabled: z.boolean().optional(),
});

const OldRoutingDecisionOutputSchema = z.object({
  ruleId: UuidLikeSchema.nullable(),
  source: z.enum(["explicit", "rule", "learned", "llm-fallback", "manual"]),
  agent: z.string(),
  confidence: z.number().nullable(),
});

const ListInputSchema = z.object({
  orgId: UuidLikeSchema.optional(),
  projectId: UuidLikeSchema.optional(),
}).optional();

const GetInputSchema = z.object({ id: UuidLikeSchema });

const CreateInputSchema = z.object({
  orgId: UuidLikeSchema.optional(),
  projectId: UuidLikeSchema.nullable().optional(),
  name: z.string().trim().min(1),
  conditionsJson: ConditionsSchema,
  actionAgent: z.string().trim().min(1),
  actionSkillSet: z.array(z.string().trim().min(1)).default([]),
  priority: z.number().int().default(100),
  enabled: z.boolean().default(true),
  source: RoutingRuleSourceSchema.default(RoutingRuleSource.Manual),
  dryRunId: z.string().uuid().optional(),
});

const UpdateInputSchema = z.object({
  id: UuidLikeSchema,
  projectId: UuidLikeSchema.nullable().optional(),
  name: z.string().trim().min(1).optional(),
  conditionsJson: ConditionsSchema.optional(),
  actionAgent: z.string().trim().min(1).optional(),
  actionSkillSet: z.array(z.string().trim().min(1)).optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
  source: RoutingRuleSourceSchema.optional(),
  dryRunId: z.string().uuid().optional(),
});

const TaskJsonSchema = z.object({
  title: z.string().default("Untitled task"),
  kind: z.string().default("task"),
  priority: z.union([z.string(), z.number()]).default("normal"),
  tags: z.array(z.string()).default([]),
  projectId: UuidLikeSchema.optional(),
  agentOverride: z.string().optional(),
});

const TestInputSchema = z.object({ taskId: UuidLikeSchema });
const DryRunInputSchema = z.object({ taskJson: TaskJsonSchema });

const routingApplication = {
  listRoutingRules,
  getRoutingRule,
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
  testRoutingRule,
  dryRunRoutingRule,
  listRoutingDrafts,
  approveRoutingDraft,
  deleteRoutingDraft,
  updateRoutingDraft,
  updateLlmGateConfig,
};

export function __setRoutingApplicationForTest(overrides: Partial<typeof routingApplication>): () => void {
  const previous = { ...routingApplication };
  Object.assign(routingApplication, overrides);
  return () => Object.assign(routingApplication, previous);
}

function appContext(ctx: { orgId: string; userId: string }) {
  return { orgId: ctx.orgId, userId: ctx.userId, projectId: null };
}

async function mapAppError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

export const routingRouter = t.router({
  list: permissionedProcedure({ resource: "routing", action: "list" })
    .input(ListInputSchema)
    .output(z.array(RoutingRuleOutputSchema))
    .query(({ ctx, input }) =>
      mapAppError(() => routingApplication.listRoutingRules(requireTrpcEntityManager(ctx), appContext(ctx), input ?? {}))
    ),

  get: permissionedProcedure({ resource: "routing", action: "get" })
    .input(GetInputSchema)
    .output(RoutingRuleOutputSchema.nullable())
    .query(({ ctx, input }) =>
      mapAppError(() => routingApplication.getRoutingRule(requireTrpcEntityManager(ctx), appContext(ctx), input.id))
    ),

  create: permissionedProcedure({ resource: "routing", action: "create" })
    .input(CreateInputSchema)
    .output(RoutingRuleOutputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() => routingApplication.createRoutingRule(requireTrpcEntityManager(ctx), appContext(ctx), input))
    ),

  update: permissionedProcedure({ resource: "routing", action: "update" })
    .input(UpdateInputSchema)
    .output(RoutingRuleOutputSchema.nullable())
    .mutation(({ ctx, input }) =>
      mapAppError(() => routingApplication.updateRoutingRule(requireTrpcEntityManager(ctx), appContext(ctx), input))
    ),

  delete: permissionedProcedure({ resource: "routing", action: "delete" })
    .input(GetInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(({ ctx, input }) =>
      mapAppError(() => routingApplication.deleteRoutingRule(requireTrpcEntityManager(ctx), appContext(ctx), input.id))
    ),

  test: permissionedProcedure({ resource: "routing", action: "test" })
    .input(TestInputSchema)
    .output(RoutingEnrichedOutputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() => routingApplication.testRoutingRule(requireTrpcEntityManager(ctx), appContext(ctx), input))
    ),

  dryRun: permissionedProcedure({ resource: "routing", action: "dryRun" })
    .input(DryRunInputSchema)
    .output(RoutingEnrichedOutputSchema)
    .query(({ ctx, input }) =>
      mapAppError(() => routingApplication.dryRunRoutingRule(requireTrpcEntityManager(ctx), appContext(ctx), input))
    ),

  drafts: t.router({
    list: permissionedProcedure({ resource: "routing", action: "list" })
      .input(DraftListInputSchema)
      .output(z.array(RoutingEnrichedOutputSchema))
      .query(({ ctx, input }) =>
        mapAppError(() => routingApplication.listRoutingDrafts())
      ),

    approve: permissionedProcedure({ resource: "routing", action: "create" })
      .input(DraftApproveInputSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(({ ctx, input }) =>
        mapAppError(() => routingApplication.approveRoutingDraft())
      ),

    delete: permissionedProcedure({ resource: "routing", action: "delete" })
      .input(DraftDeleteInputSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(({ ctx, input }) =>
        mapAppError(() => routingApplication.deleteRoutingDraft())
      ),

    update: permissionedProcedure({ resource: "routing", action: "update" })
      .input(DraftUpdateInputSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(({ ctx, input }) =>
        mapAppError(() => routingApplication.updateRoutingDraft())
      ),
  }),

  config: t.router({
    updateLlmGate: permissionedProcedure({ resource: "routing", action: "update" })
      .input(LlmGateUpdateSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(({ ctx, input }) =>
        mapAppError(() => routingApplication.updateLlmGateConfig(requireTrpcEntityManager(ctx), appContext(ctx), input))
      ),
  }),
});

export type RoutingRouter = typeof routingRouter;

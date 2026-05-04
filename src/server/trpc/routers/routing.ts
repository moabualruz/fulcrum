import { Engine, type TopLevelCondition } from "json-rules-engine";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { Event } from "../../../db/entities/core/Event.ts";
import { Org } from "../../../db/entities/auth/Org.ts";
import { RoutingRule, RoutingRuleSource } from "../../../db/entities/router/RoutingRule.ts";
import { Task } from "../../../db/entities/tasks/Task.ts";
import { RoutingRuleRepository } from "../../../db/repositories/router/RoutingRuleRepository.ts";
import { EventRepository } from "../../../db/repositories/core/EventRepository.ts";
import { autoAssign } from "../../../router/auto-assign.ts";
import { configureRulesEngine } from "../../../router/rules-engine.ts";
import { configureRoutingTelemetry } from "../../../router/telemetry.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import type { RoutingDecision, TaskFacts } from "../../../router/types.ts";

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

const RoutingDecisionOutputSchema = z.object({
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

type EntityManager = import("@mikro-orm/postgresql").EntityManager;
type RoutingRuleOutput = z.infer<typeof RoutingRuleOutputSchema>;

function requireEntityManager(ctx: { em: EntityManager | null }): EntityManager {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager could not be resolved.",
    });
  }
  return ctx.em;
}

function routingRuleRepository(em: EntityManager): RoutingRuleRepository {
  return em.getRepository(RoutingRule) as RoutingRuleRepository;
}

function eventRepository(em: EntityManager): EventRepository {
  return em.getRepository(Event) as EventRepository;
}

function configureRouting(em: EntityManager): void {
  configureRulesEngine({ routingRuleRepository: routingRuleRepository(em) });
  configureRoutingTelemetry({ eventRepository: eventRepository(em) });
}

function serializeRule(rule: RoutingRule): RoutingRuleOutput {
  return {
    id: rule.id,
    orgId: rule.org.id,
    projectId: rule.project,
    name: rule.name,
    conditionsJson: rule.conditionsJson,
    actionAgent: rule.actionAgent,
    actionSkillSet: rule.actionSkillSet,
    priority: rule.priority,
    enabled: rule.enabled,
    source: rule.source,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

async function validateConditions(conditionsJson: Record<string, unknown>): Promise<void> {
  try {
    const engine = new Engine([], { allowUndefinedFacts: true });
    engine.addRule({
      conditions: conditionsJson as TopLevelCondition,
      event: { type: "route" },
    });
    await engine.run({});
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid routing rule conditions_json: ${String(
        (error as { message?: unknown }).message ?? error,
      )}`,
      cause: error,
    });
  }
}

async function findRule(
  em: EntityManager,
  orgId: string,
  id: string,
): Promise<RoutingRule | null> {
  return em.findOne(RoutingRule, { id, org: orgId }, { populate: ["org"] });
}

function taskFactsFromTask(task: Task): TaskFacts {
  const customFields = task.customFields ?? {};
  const tags = Array.isArray(customFields["tags"])
    ? customFields["tags"].filter((tag): tag is string => typeof tag === "string")
    : [];

  return {
    task: {
      kind: task.status ?? "task",
      priority: task.priority == null ? "normal" : String(task.priority),
      tags,
      title: task.title,
    },
  };
}

function taskFactsFromJson(taskJson: z.infer<typeof TaskJsonSchema>): TaskFacts {
  return {
    task: {
      kind: taskJson.kind,
      priority: String(taskJson.priority),
      tags: taskJson.tags,
      title: taskJson.title,
    },
  };
}

export const routingRouter = t.router({
  list: permissionedProcedure({ resource: "routing", action: "list" })
    .input(ListInputSchema)
    .output(z.array(RoutingRuleOutputSchema))
    .query(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const orgId = input?.orgId ?? ctx.orgId;
      const where = {
        org: orgId,
        ...(input?.projectId !== undefined ? { project: input.projectId } : {}),
      };
      const rows = await em.find(RoutingRule, where, {
        populate: ["org"],
        orderBy: { priority: "ASC", createdAt: "ASC" },
      });

      return rows.map(serializeRule);
    }),

  get: permissionedProcedure({ resource: "routing", action: "get" })
    .input(GetInputSchema)
    .output(RoutingRuleOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const rule = await findRule(em, ctx.orgId, input.id);
      return rule ? serializeRule(rule) : null;
    }),

  create: permissionedProcedure({ resource: "routing", action: "create" })
    .input(CreateInputSchema)
    .output(RoutingRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      await validateConditions(input.conditionsJson);

      const rule = em.create(RoutingRule, {
        org: em.getReference(Org, input.orgId ?? ctx.orgId),
        project: input.projectId ?? null,
        name: input.name,
        conditionsJson: input.conditionsJson,
        actionAgent: input.actionAgent,
        actionSkillSet: input.actionSkillSet,
        priority: input.priority,
        enabled: input.enabled,
        source: input.source,
      } as never);
      await routingRuleRepository(em).save(rule);

      return serializeRule(rule);
    }),

  update: permissionedProcedure({ resource: "routing", action: "update" })
    .input(UpdateInputSchema)
    .output(RoutingRuleOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const rule = await findRule(em, ctx.orgId, input.id);
      if (!rule) return null;

      if (input.conditionsJson !== undefined) {
        await validateConditions(input.conditionsJson);
        rule.conditionsJson = input.conditionsJson;
      }
      if (input.projectId !== undefined) rule.project = input.projectId;
      if (input.name !== undefined) rule.name = input.name;
      if (input.actionAgent !== undefined) rule.actionAgent = input.actionAgent;
      if (input.actionSkillSet !== undefined) rule.actionSkillSet = input.actionSkillSet;
      if (input.priority !== undefined) rule.priority = input.priority;
      if (input.enabled !== undefined) rule.enabled = input.enabled;
      if (input.source !== undefined) rule.source = input.source;
      rule.updatedAt = new Date();

      await routingRuleRepository(em).save(rule);
      return serializeRule(rule);
    }),

  delete: permissionedProcedure({ resource: "routing", action: "delete" })
    .input(GetInputSchema)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const rule = await findRule(em, ctx.orgId, input.id);
      if (rule) await routingRuleRepository(em).remove(rule);
      return { ok: true as const };
    }),

  test: permissionedProcedure({ resource: "routing", action: "test" })
    .input(TestInputSchema)
    .output(RoutingDecisionOutputSchema.nullable())
    .mutation(async ({ ctx, input }): Promise<RoutingDecision | null> => {
      const em = requireEntityManager(ctx);
      configureRouting(em);
      const task = await em.findOne(Task, { id: input.taskId, org: ctx.orgId });
      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      }

      return autoAssign({
        taskId: task.id,
        taskFacts: taskFactsFromTask(task),
        orgId: ctx.orgId,
      });
    }),

  dryRun: permissionedProcedure({ resource: "routing", action: "dryRun" })
    .input(DryRunInputSchema)
    .output(RoutingDecisionOutputSchema.nullable())
    .query(async ({ ctx, input }): Promise<RoutingDecision | null> => {
      const em = requireEntityManager(ctx);
      configureRouting(em);

      return autoAssign({
        agentOverride: input.taskJson.agentOverride,
        taskFacts: taskFactsFromJson(input.taskJson),
        orgId: ctx.orgId,
        projectId: input.taskJson.projectId,
        dryRun: true,
      });
    }),
});

export type RoutingRouter = typeof routingRouter;

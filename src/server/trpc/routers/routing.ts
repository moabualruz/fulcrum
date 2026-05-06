import { Engine, type TopLevelCondition } from "json-rules-engine";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { Event } from "../../../db/entities/core/Event.ts";
import { Org } from "../../../db/entities/auth/Org.ts";
import { RoutingRule, RoutingRuleSource } from "../../../db/entities/router/RoutingRule.ts";
import { Task } from "../../../db/entities/tasks/Task.ts";
import { RoutingRuleRepository } from "../../../db/repositories/router/RoutingRuleRepository.ts";
import { EventRepository } from "../../../db/repositories/core/EventRepository.ts";
import { autoAssign, configureAutoAssign } from "../../../router/auto-assign.ts";
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

// ── Enriched test/dryRun output (RTR-02, D-26) ──────────────────────────

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

// ── Draft procedures schemas (D-25, D-28) ───────────────────────────────

const DraftListInputSchema = z.object({
  orgId: UuidLikeSchema.optional(),
  status: z.string().optional(),
}).optional();

const DraftApproveInputSchema = z.object({
  draftId: UuidLikeSchema,
});

const DraftDeleteInputSchema = z.object({
  draftId: UuidLikeSchema,
});

const DraftUpdateInputSchema = z.object({
  draftId: UuidLikeSchema,
  conditionsJson: ConditionsSchema.optional(),
  actionAgent: z.string().optional(),
  actionSkillSet: z.array(z.string()).optional(),
});

// ── LLM gate config schemas (D-15, D-16) ────────────────────────────────

const LlmGateUpdateSchema = z.object({
  inputMode: z.enum(["task_facts", "task_plus_history", "full_context"]).optional(),
  enabled: z.boolean().optional(),
});

// ── Old decision output (backward compat for list/get) ──────────────────

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

type EntityManager = import("@mikro-orm/postgresql").EntityManager;
type RoutingRuleOutput = z.infer<typeof RoutingRuleOutputSchema>;
type RoutingEnrichedOutput = z.infer<typeof RoutingEnrichedOutputSchema>;

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
  configureAutoAssign({});
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

/**
 * Enrich a RoutingDecision into the enriched output schema.
 * Uses autoAssign result and task facts to populate all fields.
 */
function enrichDecision(
  decision: RoutingDecision | null,
  taskFacts: TaskFacts,
): RoutingEnrichedOutput {
  if (!decision) {
    return {
      status: "no_match",
      matchedRuleId: null,
      draftId: null,
      confidence: 0,
      factsUsed: taskFacts as unknown as Record<string, unknown>,
      evidence: ["no-match: routing returned null"],
      whyUnmatched: "No routing decision was produced.",
      backend: null,
      model: null,
    };
  }

  const isMatched = decision.ruleId !== null && decision.source !== "manual";
  const status = isMatched ? "matched" as const : "no_match" as const;

  return {
    status,
    matchedRuleId: decision.ruleId,
    draftId: null,
    confidence: decision.confidence,
    factsUsed: taskFacts as unknown as Record<string, unknown>,
    evidence: isMatched
      ? [`matched rule ${decision.ruleId} with agent=${decision.agent} source=${decision.source} confidence=${decision.confidence}`]
      : [`no-match: confidence=${decision.confidence}`],
    whyUnmatched: isMatched
      ? null
      : `No matching rule found. Task kind=${taskFacts.task.kind} priority=${taskFacts.task.priority}.`,
    backend: null,
    model: null,
  };
}

/** Check if a feature flag is enabled in FULCRUM_FEATURES. */
function isFeatureEnabled(flag: string): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((f) => f.trim())
    .includes(flag);
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

  // ── Enriched test/dryRun (D-26) ──────────────────────────────────────

  test: permissionedProcedure({ resource: "routing", action: "test" })
    .input(TestInputSchema)
    .output(RoutingEnrichedOutputSchema)
    .mutation(async ({ ctx, input }): Promise<RoutingEnrichedOutput> => {
      const em = requireEntityManager(ctx);
      configureRouting(em);
      const task = await em.findOne(Task, { id: input.taskId, org: ctx.orgId });
      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      }

      const taskFacts = taskFactsFromTask(task);
      const decision = await autoAssign({
        taskId: task.id,
        taskFacts,
        orgId: ctx.orgId,
      });

      return enrichDecision(decision, taskFacts);
    }),

  dryRun: permissionedProcedure({ resource: "routing", action: "dryRun" })
    .input(DryRunInputSchema)
    .output(RoutingEnrichedOutputSchema)
    .query(async ({ ctx, input }): Promise<RoutingEnrichedOutput> => {
      const em = requireEntityManager(ctx);
      configureRouting(em);

      const taskFacts = taskFactsFromJson(input.taskJson);
      const decision = await autoAssign({
        agentOverride: input.taskJson.agentOverride,
        taskFacts,
        orgId: ctx.orgId,
        projectId: input.taskJson.projectId,
        dryRun: true,
      });

      return enrichDecision(decision, taskFacts);
    }),

  // ── Draft procedures (D-25, D-28) ─────────────────────────────────────

  drafts: t.router({
    list: permissionedProcedure({ resource: "routing", action: "list" })
      .input(DraftListInputSchema)
      .output(z.array(RoutingEnrichedOutputSchema))
      .query(async () => {
        // Stub: returns empty array until draft persistence is connected
        // via RoutingDraft entity and RoutingService.createDraftFromNoMatch
        return [];
      }),

    approve: permissionedProcedure({ resource: "routing", action: "create" })
      .input(DraftApproveInputSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async () => {
        // Stub: approve delegates to RoutingService.approveDraft
        // which is currently a no-op stub awaiting MikroORM connection
        return { ok: true as const };
      }),

    delete: permissionedProcedure({ resource: "routing", action: "delete" })
      .input(DraftDeleteInputSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async () => {
        // Stub: delete delegates to RoutingService.deleteDraft
        // which is currently a no-op stub awaiting MikroORM connection
        return { ok: true as const };
      }),

    update: permissionedProcedure({ resource: "routing", action: "update" })
      .input(DraftUpdateInputSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async () => {
        // Stub: update modifies draft conditions/actions
        // Connected in follow-up plan when persistence is wired
        return { ok: true as const };
      }),
  }),

  // ── LLM gate config procedures (D-15, D-16) ───────────────────────────

  config: t.router({
    updateLlmGate: permissionedProcedure({ resource: "routing", action: "update" })
      .input(LlmGateUpdateSchema)
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
        const em = requireEntityManager(ctx);

        // Update FULCRUM_FEATURES env for router-llm toggle
        if (input.enabled !== undefined) {
          const currentFlags = (process.env["FULCRUM_FEATURES"] ?? "")
            .split(",")
            .map((f) => f.trim())
            .filter((f) => f.length > 0 && f !== "router-llm");

          if (input.enabled) {
            currentFlags.push("router-llm");
          }

          process.env["FULCRUM_FEATURES"] = currentFlags.join(",");
        }

        // Update input mode via env (routing service reads from config)
        if (input.inputMode !== undefined) {
          process.env["FULCRUM_LLM_INPUT_MODE"] = input.inputMode;
        }

        // Log audit event
        try {
          const eventRepo = eventRepository(em);
          const org = await em.findOne(Org, { id: ctx.orgId });
          if (org) {
            const event = em.create(Event, {
              org,
              verb: "llm_gate_updated",
              subjectId: ctx.orgId,
              metadata: input as Record<string, unknown>,
            } as never);
            await em.flush();
          }
        } catch {
          // Audit event is best-effort — routing must not fail on audit failure
        }

        return { ok: true as const };
      }),
  }),
});

export type RoutingRouter = typeof routingRouter;

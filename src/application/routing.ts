import type { EntityManager } from "@mikro-orm/postgresql";
import { Engine, type TopLevelCondition } from "json-rules-engine";

import { Org } from "../db/entities/auth/Org.ts";
import { Event } from "../db/entities/core/Event.ts";
import {
  RoutingRule,
  RoutingRuleSource,
  type RoutingConditions,
} from "../db/entities/router/RoutingRule.ts";
import { Task } from "../db/entities/tasks/Task.ts";
import type { EventRepository } from "../db/repositories/core/EventRepository.ts";
import type { RoutingRuleRepository } from "../db/repositories/router/RoutingRuleRepository.ts";
import { ROUTING_EVENT_VERB, RoutingEventPayloadSchema } from "../router/routing-event-payload.ts";
import type { TaskFacts } from "../router/types.ts";
import type { RoutingDecision } from "../router/types.ts";
import { AppNotFoundError, AppValidationError } from "./errors.ts";

export interface RoutingAppContext {
  orgId: string;
  userId: string;
  projectId?: string | null;
}

export interface RoutingRuleDto {
  id: string;
  orgId: string;
  projectId: string | null;
  name: string;
  conditionsJson: Record<string, unknown>;
  actionAgent: string;
  actionSkillSet: string[];
  priority: number;
  enabled: boolean;
  source: RoutingRuleSource;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutingEnrichedDto {
  status: "matched" | "no_match" | "recommended" | "draft_created" | "conflict" | "abstained";
  matchedRuleId: string | null;
  draftId: string | null;
  factsUsed: Record<string, unknown>;
  confidence: number | null;
  backend: string | null;
  model: string | null;
  whyUnmatched: string | null;
  evidence: string[];
}

export interface RecordRoutingEventInput {
  decision: RoutingDecision;
  taskId: string;
  orgId: string;
  dryRun: boolean;
  eventRepository?: EventRepository | null;
}

export interface DetectRoutingConflictsInput {
  proposedConditions: Record<string, unknown>;
  proposedActions: Record<string, unknown>;
  orgId: string;
  projectId: string | null;
  routingRuleRepository?: RoutingRuleRepository | null;
}

export interface LearnRoutingRuleInput {
  facts: TaskFacts;
  agent: string;
  orgId: string;
  projectId?: string;
  routingRuleRepository?: RoutingRuleRepository | null;
}

export interface RoutingApplication {
  recordRoutingEvent(input: RecordRoutingEventInput): Promise<void>;
  detectRoutingConflicts(input: DetectRoutingConflictsInput): Promise<string[]>;
  learnRoutingRule(input: LearnRoutingRuleInput): Promise<RoutingRule>;
}

export const routingApplication: RoutingApplication = {
  recordRoutingEvent,
  detectRoutingConflicts,
  learnRoutingRule,
};

export async function recordRoutingEvent(input: RecordRoutingEventInput): Promise<void> {
  if (input.dryRun) return;
  if (!input.eventRepository) {
    throw new Error("routing telemetry event repository is not configured");
  }

  const payload = RoutingEventPayloadSchema.parse({
    rule_id: input.decision.ruleId,
    source: input.decision.source,
    agent: input.decision.agent,
    confidence: input.decision.confidence,
  });

  const manager = input.eventRepository.getEntityManager();
  const event = input.eventRepository.create({
    org: manager.getReference(Org, input.orgId),
    verb: ROUTING_EVENT_VERB,
    subjectKind: "task",
    subjectId: input.taskId,
    payload,
  } as never);

  manager.persist(event as Event);
  await manager.flush();
}

export async function detectRoutingConflicts(input: DetectRoutingConflictsInput): Promise<string[]> {
  if (!input.routingRuleRepository) return [];

  const activeRules = await input.routingRuleRepository.findEnabledForDispatch(
    input.orgId,
    input.projectId,
  );

  const matchingIds: string[] = [];
  for (const rule of activeRules) {
    if (doConditionsOverlap(input.proposedConditions, rule)) {
      matchingIds.push(rule.id);
    }
  }
  return matchingIds;
}

export async function learnRoutingRule(input: LearnRoutingRuleInput): Promise<RoutingRule> {
  const repository = input.routingRuleRepository;
  if (!repository) throw new Error("routing rule repository is not configured");
  const manager = repository.getEntityManager();
  const rule = repository.create({
    org: manager.getReference(Org, input.orgId),
    project: input.projectId ?? null,
    name: `Learned ${input.facts.task.kind} routing`,
    conditionsJson: conditionsFromFacts(input.facts),
    actionAgent: input.agent,
    actionSkillSet: [],
    priority: 100,
    enabled: true,
    source: RoutingRuleSource.Learned,
  } as never);

  if ("save" in repository && typeof repository.save === "function") {
    await repository.save(rule);
  } else {
    manager.persist(rule);
    await manager.flush();
  }

  return rule;
}

export async function validateRoutingConditions(conditions: Record<string, unknown>): Promise<void> {
  try {
    const engine = new Engine([], { allowUndefinedFacts: true });
    engine.addRule({
      conditions: conditions as TopLevelCondition,
      event: { type: "route" },
    });
    await engine.run({});
  } catch (error) {
    throw new AppValidationError(`Invalid routing rule conditions_json: ${String(
      (error as { message?: unknown }).message ?? error,
    )}`, { cause: error });
  }
}

export async function initDefaultRoutingRuleRepository(): Promise<RoutingRuleRepository> {
  throw new Error("default routing rule repository bootstrap is disabled; inject routing persistence from the composition root");
}

function conditionsFromFacts(facts: TaskFacts): RoutingConditions {
  return {
    all: [{ fact: "task", path: "$.kind", operator: "equal", value: facts.task.kind }],
  };
}

function doConditionsOverlap(
  proposedConditions: Record<string, unknown>,
  rule: RoutingRule,
): boolean {
  try {
    const proposedKind = extractTaskKind(proposedConditions);
    const ruleKind = extractTaskKind(rule.conditionsJson);

    if (proposedKind && ruleKind && proposedKind === ruleKind) return true;

    const proposedAgent = extractActionAgent(proposedConditions);
    return Boolean(proposedAgent && proposedAgent === rule.actionAgent);
  } catch {
    return false;
  }
}

export async function listRoutingRules(
  em: EntityManager,
  ctx: RoutingAppContext,
  input: { orgId?: string; projectId?: string } = {},
): Promise<RoutingRuleDto[]> {
  const rows = await em.find(RoutingRule, {
    org: input.orgId ?? ctx.orgId,
    ...(input.projectId !== undefined ? { project: input.projectId } : {}),
  }, {
    populate: ["org"],
    orderBy: { priority: "ASC", createdAt: "ASC" },
  });
  return rows.map(serializeRoutingRule);
}

export async function getRoutingRule(
  em: EntityManager,
  ctx: RoutingAppContext,
  id: string,
): Promise<RoutingRuleDto | null> {
  const rule = await findRoutingRule(em, ctx.orgId, id);
  return rule ? serializeRoutingRule(rule) : null;
}

export async function createRoutingRule(
  em: EntityManager,
  ctx: RoutingAppContext,
  input: {
    orgId?: string;
    projectId?: string | null;
    name: string;
    conditionsJson: Record<string, unknown>;
    actionAgent: string;
    actionSkillSet?: string[];
    priority?: number;
    enabled?: boolean;
    source?: RoutingRuleSource;
  },
): Promise<RoutingRuleDto> {
  await validateRoutingConditions(input.conditionsJson);
  const rule = em.create(RoutingRule, {
    org: em.getReference(Org, input.orgId ?? ctx.orgId),
    project: input.projectId ?? null,
    name: input.name,
    conditionsJson: input.conditionsJson,
    actionAgent: input.actionAgent,
    actionSkillSet: input.actionSkillSet ?? [],
    priority: input.priority ?? 100,
    enabled: input.enabled ?? true,
    source: input.source ?? RoutingRuleSource.Manual,
  } as never);
  await routingRuleRepository(em).save(rule);
  return serializeRoutingRule(rule);
}

export async function updateRoutingRule(
  em: EntityManager,
  ctx: RoutingAppContext,
  input: {
    id: string;
    projectId?: string | null;
    name?: string;
    conditionsJson?: Record<string, unknown>;
    actionAgent?: string;
    actionSkillSet?: string[];
    priority?: number;
    enabled?: boolean;
    source?: RoutingRuleSource;
  },
): Promise<RoutingRuleDto | null> {
  const rule = await findRoutingRule(em, ctx.orgId, input.id);
  if (!rule) return null;

  if (input.conditionsJson !== undefined) {
    await validateRoutingConditions(input.conditionsJson);
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
  return serializeRoutingRule(rule);
}

export async function deleteRoutingRule(
  em: EntityManager,
  ctx: RoutingAppContext,
  id: string,
): Promise<{ ok: true }> {
  const rule = await findRoutingRule(em, ctx.orgId, id);
  if (rule) await routingRuleRepository(em).remove(rule);
  return { ok: true };
}

export async function testRoutingRule(
  em: EntityManager,
  ctx: RoutingAppContext,
  input: { taskId: string },
): Promise<RoutingEnrichedDto> {
  await configureRouting(em);
  const { autoAssign } = await import("../router/auto-assign.ts");
  const task = await em.findOne(Task, { id: input.taskId, org: ctx.orgId });
  if (!task) throw new AppNotFoundError("Task not found.");

  const taskFacts = taskFactsFromTask(task);
  const decision = await autoAssign({ taskId: task.id, taskFacts, orgId: ctx.orgId });
  return enrichRoutingDecision(decision, taskFacts);
}

export async function dryRunRoutingRule(
  em: EntityManager,
  ctx: RoutingAppContext,
  input: { taskJson: { title: string; kind: string; priority: string | number; tags: string[]; projectId?: string; agentOverride?: string } },
): Promise<RoutingEnrichedDto> {
  await configureRouting(em);
  const { autoAssign } = await import("../router/auto-assign.ts");
  const taskFacts = taskFactsFromJson(input.taskJson);
  const decision = await autoAssign({
    agentOverride: input.taskJson.agentOverride,
    taskFacts,
    orgId: ctx.orgId,
    projectId: input.taskJson.projectId,
    dryRun: true,
  });
  return enrichRoutingDecision(decision, taskFacts);
}

export async function listRoutingDrafts(): Promise<RoutingEnrichedDto[]> {
  return [];
}

export async function approveRoutingDraft(): Promise<{ ok: true }> {
  return { ok: true };
}

export async function deleteRoutingDraft(): Promise<{ ok: true }> {
  return { ok: true };
}

export async function updateRoutingDraft(): Promise<{ ok: true }> {
  return { ok: true };
}

export async function updateLlmGateConfig(
  em: EntityManager,
  ctx: RoutingAppContext,
  input: { inputMode?: "task_facts" | "task_plus_history" | "full_context"; enabled?: boolean },
): Promise<{ ok: true }> {
  if (input.enabled !== undefined) {
    const currentFlags = (process.env["FULCRUM_FEATURES"] ?? "")
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0 && f !== "router-llm");
    if (input.enabled) currentFlags.push("router-llm");
    process.env["FULCRUM_FEATURES"] = currentFlags.join(",");
  }
  if (input.inputMode !== undefined) process.env["FULCRUM_LLM_INPUT_MODE"] = input.inputMode;

  try {
    const org = await em.findOne(Org, { id: ctx.orgId } as never);
    if (org) {
      const event = em.create(Event, {
        org,
        verb: "llm_gate_updated",
        subjectId: ctx.orgId,
        metadata: input as Record<string, unknown>,
      } as never);
      em.persist(event);
      await em.flush();
    }
  } catch {
    // Audit event is best-effort; config update remains source of truth.
  }

  return { ok: true };
}

export function serializeRoutingRule(rule: RoutingRule): RoutingRuleDto {
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

function routingRuleRepository(em: EntityManager): RoutingRuleRepository {
  return em.getRepository(RoutingRule) as RoutingRuleRepository;
}

function eventRepository(em: EntityManager): EventRepository {
  return em.getRepository(Event) as EventRepository;
}

async function configureRouting(em: EntityManager): Promise<void> {
  const [{ configureAutoAssign }, { configureRulesEngine }, { configureRoutingTelemetry }] = await Promise.all([
    import("../router/auto-assign.ts"),
    import("../router/rules-engine.ts"),
    import("../router/telemetry.ts"),
  ]);
  configureAutoAssign({});
  configureRulesEngine({ routingRuleRepository: routingRuleRepository(em) });
  configureRoutingTelemetry({ eventRepository: eventRepository(em) });
}

function findRoutingRule(em: EntityManager, orgId: string, id: string): Promise<RoutingRule | null> {
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

function taskFactsFromJson(taskJson: { title: string; kind: string; priority: string | number; tags: string[] }): TaskFacts {
  return {
    task: {
      kind: taskJson.kind,
      priority: String(taskJson.priority),
      tags: taskJson.tags,
      title: taskJson.title,
    },
  };
}

function enrichRoutingDecision(decision: RoutingDecision | null, taskFacts: TaskFacts): RoutingEnrichedDto {
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
  return {
    status: isMatched ? "matched" : "no_match",
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

function extractTaskKind(conditions: Record<string, unknown>): string | null {
  const all = conditions["all"];
  if (!Array.isArray(all)) return null;

  for (const condition of all) {
    if (
      typeof condition === "object" &&
      condition !== null &&
      "fact" in condition &&
      "value" in condition
    ) {
      const candidate = condition as Record<string, unknown>;
      if (
        (candidate["fact"] === "task.kind" || candidate["fact"] === "task") &&
        typeof candidate["value"] === "string"
      ) {
        return candidate["value"];
      }
      if (
        candidate["fact"] === "task" &&
        candidate["path"] === "$.kind" &&
        typeof candidate["value"] === "string"
      ) {
        return candidate["value"];
      }
    }
  }

  return null;
}

function extractActionAgent(conditions: Record<string, unknown>): string | null {
  const all = conditions["all"];
  if (!Array.isArray(all)) return null;

  for (const condition of all) {
    if (
      typeof condition === "object" &&
      condition !== null &&
      "fact" in condition &&
      (condition as Record<string, unknown>)["fact"] === "action_agent" &&
      typeof (condition as Record<string, unknown>)["value"] === "string"
    ) {
      return (condition as Record<string, unknown>)["value"] as string;
    }
  }

  return null;
}

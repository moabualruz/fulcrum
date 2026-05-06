import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { MikroORM } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";
import { Engine, type TopLevelCondition } from "json-rules-engine";

import { Org } from "../db/entities/auth/Org.ts";
import { Event } from "../db/entities/core/Event.ts";
import {
  RoutingRule,
  RoutingRuleSource,
  type RoutingConditions,
} from "../db/entities/router/RoutingRule.ts";
import { createOrmConfig } from "../db/mikro-orm.config.ts";
import type { EventRepository } from "../db/repositories/core/EventRepository.ts";
import type { RoutingRuleRepository } from "../db/repositories/router/RoutingRuleRepository.ts";
import { ROUTING_EVENT_VERB, RoutingEventPayloadSchema } from "../router/routing-event-payload.ts";
import type { TaskFacts } from "../router/types.ts";
import type { RoutingDecision } from "../router/types.ts";

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
  const repository = input.routingRuleRepository ?? await initDefaultRoutingRuleRepository();
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
  const engine = new Engine([], { allowUndefinedFacts: true });
  engine.addRule({
    conditions: conditions as TopLevelCondition,
    event: { type: "route" },
  });
  await engine.run({});
}

function conditionsFromFacts(facts: TaskFacts): RoutingConditions {
  return {
    all: [{ fact: "task", path: "$.kind", operator: "equal", value: facts.task.kind }],
  };
}

export async function initDefaultRoutingRuleRepository(): Promise<RoutingRuleRepository> {
  const dbDir = join(process.env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum"), "db");
  await mkdir(dbDir, { recursive: true });
  const pglite = new PGlite(join(dbDir, "main"));
  await pglite.waitReady;
  const orm = await MikroORM.init(createOrmConfig({ pglite, debug: false }));
  return orm.em.fork().getRepository(RoutingRule) as RoutingRuleRepository;
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

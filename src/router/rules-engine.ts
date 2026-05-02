import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Engine, type TopLevelCondition } from "json-rules-engine";
import { MikroORM } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig, RoutingRule } from "../db/mikro-orm.config.ts";
import type { RoutingRule as RoutingRuleEntity } from "../db/entities/router/RoutingRule.ts";
import type { RoutingRuleRepository } from "../db/repositories/router/RoutingRuleRepository.ts";
import type { TaskFacts } from "./types.ts";

interface RulesEngineConfig {
  routingRuleRepository: RoutingRuleRepository | null;
}

export interface RuleMatch {
  ruleId: string;
  agent: string;
}

let configuredRepository: RoutingRuleRepository | null = null;
let defaultRepositoryPromise: Promise<RoutingRuleRepository> | null = null;

export function configureRulesEngine(config: RulesEngineConfig): void {
  configuredRepository = config.routingRuleRepository;
}

export async function evaluateRules(
  facts: TaskFacts,
  orgId: string,
  projectId?: string,
): Promise<string | null> {
  const match = await evaluateRuleMatch(facts, orgId, projectId);
  return match?.agent ?? null;
}

export async function evaluateRuleMatch(
  facts: TaskFacts,
  orgId: string,
  projectId?: string,
): Promise<RuleMatch | null> {
  const repository = await getRoutingRuleRepository();
  const rules = await repository.findEnabledForDispatch(orgId, projectId ?? null);

  for (const rule of sortRulesForDispatch(rules, projectId)) {
    const agent = await evaluateRule(rule, facts, repository);
    if (agent) return { ruleId: rule.id, agent };
  }

  return null;
}

export type { TaskFacts } from "./types.ts";

async function evaluateRule(
  rule: RoutingRuleEntity,
  facts: TaskFacts,
  repository: RoutingRuleRepository,
): Promise<string | null> {
  try {
    const engine = new Engine([], { allowUndefinedFacts: true });
    engine.addRule({
      conditions: rule.conditionsJson as TopLevelCondition,
      event: { type: "route", params: { agent: rule.actionAgent } },
      priority: rule.priority,
      name: rule.id,
    });

    const result = await engine.run(toRuleFacts(facts));
    return result.events.length > 0 ? rule.actionAgent : null;
  } catch (error) {
    await disableMalformedRule(rule, repository, error);
    return null;
  }
}

function sortRulesForDispatch(
  rules: RoutingRuleEntity[],
  projectId?: string,
): RoutingRuleEntity[] {
  return [...rules].sort((left, right) => {
    const priority = left.priority - right.priority;
    if (priority !== 0) return priority;

    const leftProjectRank = left.project && left.project === projectId ? 0 : 1;
    const rightProjectRank = right.project && right.project === projectId ? 0 : 1;
    if (leftProjectRank !== rightProjectRank) return leftProjectRank - rightProjectRank;

    return left.createdAt.getTime() - right.createdAt.getTime();
  });
}

function toRuleFacts(facts: TaskFacts): Record<string, unknown> {
  return {
    ...facts,
    "task.kind": facts.task.kind,
    "task.priority": facts.task.priority,
    "task.tags": facts.task.tags,
    "task.title": facts.task.title,
  };
}

async function disableMalformedRule(
  rule: RoutingRuleEntity,
  repository: RoutingRuleRepository,
  error: unknown,
): Promise<void> {
  rule.enabled = false;
  rule.updatedAt = new Date();
  await repository.getEntityManager().flush();
  console.error(
    `Disabled malformed routing rule ${rule.id}: ${String(
      (error as { message?: unknown }).message ?? error,
    )}`,
  );
}

async function getRoutingRuleRepository(): Promise<RoutingRuleRepository> {
  if (configuredRepository) return configuredRepository;
  defaultRepositoryPromise ??= initDefaultRoutingRuleRepository();
  return defaultRepositoryPromise;
}

async function initDefaultRoutingRuleRepository(): Promise<RoutingRuleRepository> {
  const dbDir = join(process.env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum"), "db");
  await mkdir(dbDir, { recursive: true });
  const pglite = new PGlite(join(dbDir, "main"));
  await pglite.waitReady;
  const orm = await MikroORM.init(createOrmConfig({ pglite, debug: false }));
  return orm.em.fork().getRepository(RoutingRule) as RoutingRuleRepository;
}

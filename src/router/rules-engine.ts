/**
 * rules-engine.ts — Tier 2 deterministic routing rule evaluation.
 *
 * Uses json-rules-engine against rows from the routing_rules table.
 * Backed by ProductDb (PGlite/Postgres) rather than MikroORM on this branch.
 *
 * Injectable via configureRulesEngine for test isolation.
 */

import type { TaskFacts } from "./types.ts";

export interface RoutingRuleRow {
  id: string;
  org_id: string;
  project_id: string | null;
  name: string;
  conditions_json: Record<string, unknown>;
  action_agent: string;
  action_skill_set: string[];
  priority: number;
  enabled: boolean;
  source: string;
  created_at: string;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RoutingRuleRepository {
  // Return type is `any[]` so this interface is satisfied by both the ProductDb
  // row-based repository (returns RoutingRuleRow[]) and the MikroORM EntityRepository
  // subclass (returns RoutingRule[]) used in plan/agent-os-vision tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findEnabledForDispatch(orgId: string, projectId?: string | null): Promise<any[]>;
  getEntityManager(): { flush(): Promise<void> };
}

export interface RuleMatch {
  ruleId: string;
  agent: string;
}

interface RulesEngineConfig {
  routingRuleRepository: RoutingRuleRepository | null;
}

let configuredRepository: RoutingRuleRepository | null = null;

export function configureRulesEngine(config: RulesEngineConfig): void {
  configuredRepository = config.routingRuleRepository;
}

export async function evaluateRuleMatch(
  facts: TaskFacts,
  orgId: string,
  projectId?: string,
): Promise<RuleMatch | null> {
  if (!configuredRepository) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rules: any[] = await configuredRepository.findEnabledForDispatch(orgId, projectId ?? null);
  const sorted = sortRulesAny(rules, projectId);

  for (const rule of sorted) {
    const conditions = getConditions(rule);
    const agent = getAgent(rule);
    if (conditions && agent && matchesConditions(conditions, facts)) {
      return { ruleId: String(rule.id), agent };
    }
  }

  return null;
}

export type { TaskFacts } from "./types.ts";

/** Convenience wrapper — returns just the agent string or null. */
export async function evaluateRules(
  facts: TaskFacts,
  orgId: string,
  projectId?: string,
): Promise<string | null> {
  const match = await evaluateRuleMatch(facts, orgId, projectId);
  return match?.agent ?? null;
}

/**
 * RulesEngine class — exported for test / hot-reload compatibility.
 * Wraps the module-level repository with an object interface.
 */
export class RulesEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly repository: RoutingRuleRepository, private readonly _eventBus?: any) {}

  async evaluateRules(facts: TaskFacts, orgId: string, projectId?: string): Promise<string | null> {
    const match = await this.evaluateRuleMatch(facts, orgId, projectId);
    return match?.agent ?? null;
  }

  async evaluateRuleMatch(
    facts: TaskFacts,
    orgId: string,
    projectId?: string,
  ): Promise<RuleMatch | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rules: any[] = await this.repository.findEnabledForDispatch(orgId, projectId ?? null);
    const sorted = sortRulesAny(rules, projectId);
    for (const rule of sorted) {
      const conditions = getConditions(rule);
      const agent = getAgent(rule);
      if (conditions && agent && matchesConditions(conditions, facts)) {
        return { ruleId: String(rule.id), agent };
      }
    }
    return null;
  }

  /** No-op: kept for API compat with plan/agent-os-vision RulesEngine. */
  initialize(): void {}
  destroy(): void {}
}

// ─── condition evaluation ─────────────────────────────────────────────────────

/**
 * Minimal json-rules-engine-compatible condition evaluator.
 * Supports the `all` / `any` top-level keys and the `equal` operator.
 * Fact paths: bare fact name OR dot-path like "task.kind".
 */
function matchesConditions(
  conditions: Record<string, unknown>,
  facts: TaskFacts,
): boolean {
  const flatFacts = toFlatFacts(facts);

  if (Array.isArray(conditions["all"])) {
    return (conditions["all"] as Condition[]).every((c) => evalCondition(c, flatFacts));
  }
  if (Array.isArray(conditions["any"])) {
    return (conditions["any"] as Condition[]).some((c) => evalCondition(c, flatFacts));
  }
  return false;
}

interface Condition {
  fact: string;
  operator: string;
  value: unknown;
  path?: string;
}

function evalCondition(c: Condition, flat: Record<string, unknown>): boolean {
  const factValue = flat[c.fact] ?? flat[c.fact.replace(/\./g, "_")];
  switch (c.operator) {
    case "equal":
      return factValue === c.value;
    case "notEqual":
      return factValue !== c.value;
    case "in":
      return Array.isArray(c.value) && (c.value as unknown[]).includes(factValue);
    case "notIn":
      return Array.isArray(c.value) && !(c.value as unknown[]).includes(factValue);
    default:
      return false;
  }
}

function toFlatFacts(facts: TaskFacts): Record<string, unknown> {
  return {
    ...facts,
    "task.kind": facts.task.kind,
    "task.priority": facts.task.priority,
    "task.tags": facts.task.tags,
    "task.title": facts.task.title,
  };
}

// ─── row accessors (handle both snake_case ProductDb rows and camelCase MikroORM entities) ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getConditions(rule: any): Record<string, unknown> | null {
  const c = rule.conditions_json ?? rule.conditionsJson;
  if (!c || typeof c !== "object") return null;
  return c as Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAgent(rule: any): string | null {
  const a = rule.action_agent ?? rule.actionAgent;
  return typeof a === "string" ? a : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getProjectId(rule: any): string | null {
  return rule.project_id ?? rule.project ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCreatedAt(rule: any): Date {
  const v = rule.created_at ?? rule.createdAt;
  return v instanceof Date ? v : new Date(v ?? 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sortRulesAny(rules: any[], projectId?: string): any[] {
  return [...rules].sort((a, b) => {
    const byPriority = (a.priority ?? 100) - (b.priority ?? 100);
    if (byPriority !== 0) return byPriority;
    const aProject = getProjectId(a) === projectId ? 0 : 1;
    const bProject = getProjectId(b) === projectId ? 0 : 1;
    if (aProject !== bProject) return aProject - bProject;
    return getCreatedAt(a).getTime() - getCreatedAt(b).getTime();
  });
}

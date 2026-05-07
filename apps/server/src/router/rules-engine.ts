import { Engine, type TopLevelCondition } from "json-rules-engine";

import { initDefaultRoutingRuleRepository } from "@/application/routing.ts";
import type { TaskFacts } from "./types.ts";
import { RoutingEventBus, routingEventBus } from "./event-bus.ts";

interface RulesEngineConfig {
  routingRuleRepository: RoutingRuleStore | null;
  eventBus?: RoutingEventBus;
  onMalformedRule?: MalformedRuleHandler | null;
}

export interface RuleMatch {
  ruleId: string;
  agent: string;
}

export interface RoutingRuleRecord {
  id: string;
  project: string | null;
  conditionsJson: Record<string, unknown>;
  actionAgent: string;
  priority: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutingRuleStore {
  findEnabledForDispatch(orgId: string, projectId?: string | null): Promise<RoutingRuleRecord[]>;
  setEventBus?(bus: RoutingEventBus): void;
}

export type MalformedRuleHandler = (
  rule: RoutingRuleRecord,
  error: unknown,
) => Promise<void> | void;

let configuredEngine: RulesEngine | null = null;
let defaultEngine: RulesEngine | null = null;
let defaultEnginePromise: Promise<RulesEngine> | null = null;

export function configureRulesEngine(config: RulesEngineConfig): void {
  configuredEngine?.destroy();
  defaultEngine?.destroy();
  configuredEngine = null;
  defaultEngine = null;
  defaultEnginePromise = null;

  if (!config.routingRuleRepository) {
    configuredEngine = null;
    return;
  }

  const bus = config.eventBus ?? routingEventBus;
  config.routingRuleRepository.setEventBus?.(bus);
  configuredEngine = new RulesEngine(
    config.routingRuleRepository,
    bus,
    config.onMalformedRule ?? null,
  );
  configuredEngine.initialize();
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
  const engine = await getRulesEngine();
  return engine.evaluateRuleMatch(facts, orgId, projectId);
}

export type { TaskFacts } from "./types.ts";

export class RulesEngine {
  private readonly cache = new Map<
    string,
    { loadedVersion: number; rules: RoutingRuleRecord[] }
  >();
  private rulesVersion = 0;
  private subscribed = false;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly repository: RoutingRuleStore,
    private readonly eventBus: RoutingEventBus,
    private readonly onMalformedRule: MalformedRuleHandler | null = null,
  ) {}

  initialize(): void {
    if (this.subscribed) return;
    this.unsubscribe = this.eventBus.onRulesChanged(() => this.markStale());
    this.subscribed = true;
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.subscribed = false;
  }

  async evaluateRules(facts: TaskFacts, orgId: string, projectId?: string): Promise<string | null> {
    const match = await this.evaluateRuleMatch(facts, orgId, projectId);
    return match?.agent ?? null;
  }

  async evaluateRuleMatch(facts: TaskFacts, orgId: string, projectId?: string): Promise<RuleMatch | null> {
    const cacheKey = `${orgId}:${projectId ?? ""}`;
    const rules = await this.rulesFor(cacheKey, orgId, projectId ?? null);

    for (const rule of sortRulesForDispatch(rules, projectId)) {
      const result = await evaluateRule(rule, facts);
      if (result.agent) return { ruleId: rule.id, agent: result.agent };
      if (result.error) await this.reportMalformedRule(rule, result.error);
    }

    return null;
  }

  private async reportMalformedRule(
    rule: RoutingRuleRecord,
    error: unknown,
  ): Promise<void> {
    if (!this.onMalformedRule) {
      console.error(
        `Skipped malformed routing rule ${rule.id}: ${String(
          (error as { message?: unknown }).message ?? error,
        )}`,
      );
      return;
    }

    try {
      await this.onMalformedRule(rule, error);
    } catch (handlerError) {
      console.error(
        `Malformed routing rule handler failed for ${rule.id}: ${String(
          (handlerError as { message?: unknown }).message ?? handlerError,
        )}`,
      );
    } finally {
      this.markStale();
    }
  }

  private markStale(): void {
    this.rulesVersion += 1;
  }

  private async rulesFor(
    cacheKey: string,
    orgId: string,
    projectId: string | null,
  ): Promise<RoutingRuleRecord[]> {
    if (this.onMalformedRule) {
      return this.repository.findEnabledForDispatch(orgId, projectId);
    }

    if (
      this.cache.get(cacheKey)?.loadedVersion === this.rulesVersion
    ) {
      return this.cache.get(cacheKey)!.rules;
    }

    while (true) {
      const refreshVersion = this.rulesVersion;
      try {
        const rules = await this.repository.findEnabledForDispatch(orgId, projectId);
        if (refreshVersion !== this.rulesVersion) continue;
        this.cache.set(cacheKey, { rules, loadedVersion: refreshVersion });
        return rules;
      } catch (error) {
        const cached = this.cache.get(cacheKey);
        if (cached) {
          console.error(
            `Routing rules refresh failed; serving stale cache: ${String(
              (error as { message?: unknown }).message ?? error,
            )}`,
          );
          return cached.rules;
        }
        throw error;
      }
    }
  }
}

async function evaluateRule(
  rule: RoutingRuleRecord,
  facts: TaskFacts,
): Promise<{ agent: string | null; error: unknown | null }> {
  try {
    const engine = new Engine([], { allowUndefinedFacts: true });
    engine.addRule({
      conditions: rule.conditionsJson as TopLevelCondition,
      event: { type: "route", params: { agent: rule.actionAgent } },
      priority: rule.priority,
      name: rule.id,
    });

    const result = await engine.run(toRuleFacts(facts));
    if (result.events.length > 0 || matchesTaskKind(rule.conditionsJson, facts.task.kind)) {
      return { agent: rule.actionAgent, error: null };
    }
    return { agent: null, error: null };
  } catch (error) {
    return { agent: null, error };
  }
}

function matchesTaskKind(conditions: Record<string, unknown>, kind: string): boolean {
  const all = conditions["all"];
  if (!Array.isArray(all)) return false;
  return all.some((condition) => {
    if (!condition || typeof condition !== "object") return false;
    const candidate = condition as Record<string, unknown>;
    if (candidate["operator"] !== "equal" || candidate["value"] !== kind) return false;
    return candidate["fact"] === "task.kind" ||
      (candidate["fact"] === "task" && candidate["path"] === "$.kind");
  });
}

function sortRulesForDispatch(
  rules: RoutingRuleRecord[],
  projectId?: string,
): RoutingRuleRecord[] {
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

async function getRulesEngine(): Promise<RulesEngine> {
  if (configuredEngine) return configuredEngine;
  defaultEnginePromise ??= initDefaultRulesEngine().catch((error) => {
    defaultEnginePromise = null;
    throw error;
  });
  return defaultEnginePromise;
}

async function initDefaultRulesEngine(): Promise<RulesEngine> {
  const repository = await initDefaultRoutingRuleRepository();
  repository.setEventBus?.(routingEventBus);
  const engine = new RulesEngine(repository, routingEventBus);
  engine.initialize();
  defaultEngine = engine;
  return engine;
}

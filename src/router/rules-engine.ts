import { Engine, type TopLevelCondition } from "json-rules-engine";

import type { RoutingRule as RoutingRuleEntity } from "../db/entities/router/RoutingRule.ts";
import type { RoutingRuleRepository } from "../db/repositories/router/RoutingRuleRepository.ts";
import { initDefaultRoutingRuleRepository } from "../application/routing.ts";
import type { TaskFacts } from "./types.ts";
import { RoutingEventBus, routingEventBus } from "./event-bus.ts";

interface RulesEngineConfig {
  routingRuleRepository: RoutingRuleRepository | null;
  eventBus?: RoutingEventBus;
}

export interface RuleMatch {
  ruleId: string;
  agent: string;
}

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
  configuredEngine = new RulesEngine(config.routingRuleRepository, bus);
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
    { loadedVersion: number; rules: RoutingRuleEntity[] }
  >();
  private rulesVersion = 0;
  private subscribed = false;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly repository: RoutingRuleRepository,
    private readonly eventBus: RoutingEventBus,
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
      const agent = await evaluateRule(rule, facts, this.repository, () => {
        this.markStale();
      });
      if (agent) return { ruleId: rule.id, agent };
    }

    return null;
  }

  private markStale(): void {
    this.rulesVersion += 1;
  }

  private async rulesFor(
    cacheKey: string,
    orgId: string,
    projectId: string | null,
  ): Promise<RoutingRuleEntity[]> {
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
  rule: RoutingRuleEntity,
  facts: TaskFacts,
  repository: RoutingRuleRepository,
  onDisable?: () => void,
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
    try {
      await disableMalformedRule(rule, repository, error);
    } catch (disableError) {
      console.error(
        `Failed to disable malformed routing rule ${rule.id}: ${String(
          (disableError as { message?: unknown }).message ?? disableError,
        )}`,
      );
    } finally {
      onDisable?.();
    }
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

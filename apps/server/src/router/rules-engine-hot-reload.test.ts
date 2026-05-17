import { beforeEach, describe, expect, it } from "bun:test";

import {
  RoutingRuleSource,
  type RoutingConditions,
  type RoutingRule,
} from "@execution-orchestration/infrastructure/database/entities/router/RoutingRule.ts";
import type { RoutingRuleRepository } from "@execution-orchestration/infrastructure/database/repositories/router/RoutingRuleRepository.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { RoutingEventBus } from "./event-bus.ts";
import { RulesEngine, type TaskFacts } from "./rules-engine.ts";

const FACTS: TaskFacts = {
  task: {
    kind: "bug",
    priority: "high",
    tags: ["backend"],
    title: "Fix routing regression",
  },
};

const BUG_CONDITIONS: RoutingConditions = {
  all: [{ fact: "task", path: "$.kind", operator: "equal", value: "bug" }],
};

describe("RulesEngine (hot-reload)", () => {
  let rules: RoutingRule[];

  beforeEach(() => {
    rules = [];
  });

  function makeRepository(): RoutingRuleRepository {
    return {
      async findEnabledForDispatch(orgId: string, projectId?: string | null) {
        return rules
          .filter((r) => r.org.id === orgId && r.enabled)
          .filter((r) =>
            projectId
              ? r.project === projectId || r.project === null
              : r.project === null,
          );
      },
      getEntityManager: () => ({ flush: async () => {} }),
    } as unknown as RoutingRuleRepository;
  }

  function addRule(overrides: {
    actionAgent?: string;
    conditionsJson?: RoutingConditions;
    priority?: number;
  } = {}): RoutingRule {
    const rule = {
      id: crypto.randomUUID(),
      org: { id: DEFAULT_ORG_ID },
      project: null,
      name: "test-rule",
      conditionsJson: overrides.conditionsJson ?? BUG_CONDITIONS,
      actionAgent: overrides.actionAgent ?? "codex",
      actionSkillSet: [],
      priority: overrides.priority ?? 100,
      enabled: true,
      source: RoutingRuleSource.Manual,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as RoutingRule;
    rules.push(rule);
    return rule;
  }

  it("picks up a rule added after initialize() without process restart", async () => {
    const bus = new RoutingEventBus();
    const engine = new RulesEngine(makeRepository(), bus);
    engine.initialize();

    expect(await engine.evaluateRules(FACTS, DEFAULT_ORG_ID)).toBeNull();

    addRule({ actionAgent: "codex" });
    bus.emitRulesChanged();

    expect(await engine.evaluateRules(FACTS, DEFAULT_ORG_ID)).toBe("codex");
  });

  it("retries refresh when rules change while repository load is in flight", async () => {
    const bus = new RoutingEventBus();
    let calls = 0;
    let releaseFirstLoad!: () => void;
    let firstLoadStarted!: () => void;
    const firstLoadStartedPromise = new Promise<void>((resolve) => {
      firstLoadStarted = resolve;
    });
    const firstLoadReleasedPromise = new Promise<void>((resolve) => {
      releaseFirstLoad = resolve;
    });

    const repo = {
      async findEnabledForDispatch(orgId: string, projectId?: string | null) {
        calls += 1;
        const snapshot = rules
          .filter((r) => r.org.id === orgId && r.enabled)
          .filter((r) =>
            projectId
              ? r.project === projectId || r.project === null
              : r.project === null,
          );

        if (calls === 1) {
          firstLoadStarted();
          await firstLoadReleasedPromise;
        }

        return snapshot;
      },
      getEntityManager: () => ({ flush: async () => {} }),
    } as unknown as RoutingRuleRepository;

    const engine = new RulesEngine(repo, bus);
    engine.initialize();

    const result = engine.evaluateRules(FACTS, DEFAULT_ORG_ID);
    await firstLoadStartedPromise;

    addRule({ actionAgent: "codex" });
    bus.emitRulesChanged();
    releaseFirstLoad();

    expect(await result).toBe("codex");
    expect(calls).toBe(2);
  });

  it("serves cached rules when a hot-reload refresh fails", async () => {
    const bus = new RoutingEventBus();
    let failLoads = false;
    addRule({ actionAgent: "codex" });

    const repo = {
      async findEnabledForDispatch(orgId: string) {
        if (failLoads) throw new Error("transient routing store failure");
        return rules.filter((r) => r.org.id === orgId && r.enabled && r.project === null);
      },
      getEntityManager: () => ({ flush: async () => {} }),
    } as unknown as RoutingRuleRepository;

    const engine = new RulesEngine(repo, bus);
    engine.initialize();

    expect(await engine.evaluateRules(FACTS, DEFAULT_ORG_ID)).toBe("codex");

    failLoads = true;
    bus.emitRulesChanged();

    await expect(engine.evaluateRules(FACTS, DEFAULT_ORG_ID)).resolves.toBe("codex");
  });

  it("continues evaluating fallback rules when disabling a malformed rule fails", async () => {
    addRule({
      actionAgent: "broken",
      conditionsJson: { all: [{ fact: "task", value: "bug" }] } as RoutingConditions,
      priority: 5,
    });
    addRule({ actionAgent: "codex", priority: 10 });

    const repo = {
      async findEnabledForDispatch(orgId: string) {
        return rules.filter((r) => r.org.id === orgId && r.enabled && r.project === null);
      },
      getEntityManager: () => ({
        async flush() {
          throw new Error("flush failed");
        },
      }),
    } as unknown as RoutingRuleRepository;

    const engine = new RulesEngine(repo, new RoutingEventBus());
    engine.initialize();

    await expect(engine.evaluateRules(FACTS, DEFAULT_ORG_ID)).resolves.toBe("codex");
  });

  it("integration: rule persisted via repository.save() is picked up by next evaluateRules", async () => {
    const bus = new RoutingEventBus();

    const repo: RoutingRuleRepository & { save(r: RoutingRule): Promise<void> } = {
      async findEnabledForDispatch(orgId: string) {
        return rules.filter((r) => r.org.id === orgId && r.enabled && r.project === null);
      },
      getEntityManager: () => ({ flush: async () => {} }),
      async save(rule: RoutingRule) {
        rules.push(rule);
        bus.emitRulesChanged();
      },
    } as unknown as RoutingRuleRepository & { save(r: RoutingRule): Promise<void> };

    const engine = new RulesEngine(repo, bus);
    engine.initialize();

    expect(await engine.evaluateRules(FACTS, DEFAULT_ORG_ID)).toBeNull();

    const rule = {
      id: crypto.randomUUID(),
      org: { id: DEFAULT_ORG_ID },
      project: null,
      name: "hot-rule",
      conditionsJson: BUG_CONDITIONS,
      actionAgent: "codex",
      actionSkillSet: [],
      priority: 100,
      enabled: true,
      source: RoutingRuleSource.Manual,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as RoutingRule;
    await repo.save(rule);

    expect(await engine.evaluateRules(FACTS, DEFAULT_ORG_ID)).toBe("codex");
  });

  it("does not register duplicate subscriptions on repeated initialize() calls", () => {
    const bus = new RoutingEventBus();
    const engine = new RulesEngine(makeRepository(), bus);

    engine.initialize();
    engine.initialize();
    engine.initialize();

    expect(bus.listenerCount()).toBe(1);
  });

  it("continues notifying listeners when one hot-reload listener throws", () => {
    const bus = new RoutingEventBus();
    let calls = 0;

    bus.onRulesChanged(() => {
      throw new Error("bad listener");
    });
    bus.onRulesChanged(() => {
      calls += 1;
    });

    expect(() => bus.emitRulesChanged()).not.toThrow();
    expect(calls).toBe(1);
  });

  it("unsubscribes from hot-reload events on destroy()", () => {
    const bus = new RoutingEventBus();
    const engine = new RulesEngine(makeRepository(), bus);

    engine.initialize();
    expect(bus.listenerCount()).toBe(1);

    engine.destroy();

    expect(bus.listenerCount()).toBe(0);
  });
});

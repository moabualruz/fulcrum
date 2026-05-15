import { describe, expect, it } from "bun:test";

import {
  RoutingRuleSource,
  type RoutingConditions,
  type RoutingRule,
} from "@execution-orchestration/infrastructure/database/entities/router/RoutingRule.ts";
import type { EventRepository } from "@platform-core/infrastructure/application-database/repositories/core/EventRepository.ts";
import type { RoutingRuleRepository } from "@execution-orchestration/infrastructure/database/repositories/router/RoutingRuleRepository.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import {
  detectRoutingConflicts,
  disableMalformedRoutingRule,
  initDefaultRoutingRuleRepository,
  learnRoutingRule,
  listRoutingDrafts,
  recordRoutingEvent,
  validateRoutingConditions,
} from "@execution-orchestration/application/routing.ts";

const BUG_CONDITIONS: RoutingConditions = {
  all: [{ fact: "task", path: "$.kind", operator: "equal", value: "bug" }],
};

describe("routing application malformed rules", () => {
  it("disables malformed rules through the application repository facade", async () => {
    const rule = createRule();
    const saved: RoutingRule[] = [];
    const repository = {
      async save(input: RoutingRule) {
        saved.push(input);
      },
    } as unknown as RoutingRuleRepository;

    await disableMalformedRoutingRule({ rule, repository, error: new Error("bad condition") });

    expect(rule.enabled).toBe(false);
    expect(rule.updatedAt.getTime()).toBeGreaterThan(rule.createdAt.getTime());
    expect(saved).toEqual([rule]);
  });
});

describe("routing application service helpers", () => {
  it("records routing telemetry only for non-dry-run decisions", async () => {
    const persisted: unknown[] = [];
    const manager = {
      async save(event: unknown) {
        persisted.push(event);
      },
    };
    const eventRepository = {
      get manager() {
        return manager;
      },
      create(input: unknown) {
        return { id: "event-1", ...(input as Record<string, unknown>) };
      },
    } as unknown as EventRepository;

    await recordRoutingEvent({
      dryRun: true,
      eventRepository,
      orgId: DEFAULT_ORG_ID,
      taskId: "task-1",
      decision: { ruleId: "11111111-1111-4111-8111-111111111111", source: "rule", agent: "codex", confidence: 0.9 },
    });
    expect(persisted).toHaveLength(0);

    await expect(recordRoutingEvent({
      dryRun: false,
      eventRepository: null,
      orgId: DEFAULT_ORG_ID,
      taskId: "task-1",
      decision: { ruleId: "11111111-1111-4111-8111-111111111111", source: "rule", agent: "codex", confidence: 0.9 },
    })).rejects.toThrow("routing telemetry event repository is not configured");

    await recordRoutingEvent({
      dryRun: false,
      eventRepository,
      orgId: DEFAULT_ORG_ID,
      taskId: "task-1",
      decision: { ruleId: "11111111-1111-4111-8111-111111111111", source: "rule", agent: "codex", confidence: 0.9 },
    });

    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      verb: "routed",
      subjectKind: "task",
      subjectId: "task-1",
      payload: {
        rule_id: "11111111-1111-4111-8111-111111111111",
        source: "rule",
        agent: "codex",
        confidence: 0.9,
      },
    });
  });

  it("detects routing conflicts by task kind and action-agent overlap", async () => {
    const kindRule = createRule({ id: "kind-rule", actionAgent: "codex" });
    const actionRule = createRule({
      id: "action-rule",
      actionAgent: "claude",
      conditionsJson: { all: [{ fact: "task", path: "$.kind", operator: "equal", value: "feature" }] },
    });
    const malformedRule = createRule({
      id: "malformed-rule",
      conditionsJson: {
        get all() {
          throw new Error("bad rule");
        },
      } as unknown as RoutingConditions,
    });
    const repository = {
      async findEnabledForDispatch(orgId: string, projectId: string | null) {
        expect(orgId).toBe(DEFAULT_ORG_ID);
        expect(projectId).toBeNull();
        return [kindRule, actionRule, malformedRule];
      },
    } as unknown as RoutingRuleRepository;

    expect(await detectRoutingConflicts({
      routingRuleRepository: null,
      orgId: DEFAULT_ORG_ID,
      projectId: null,
      proposedActions: {},
      proposedConditions: BUG_CONDITIONS,
    })).toEqual([]);

    await expect(detectRoutingConflicts({
      routingRuleRepository: repository,
      orgId: DEFAULT_ORG_ID,
      projectId: null,
      proposedActions: {},
      proposedConditions: { all: [{ fact: "action_agent", operator: "equal", value: "claude" }] },
    })).resolves.toEqual(["action-rule"]);

    await expect(detectRoutingConflicts({
      routingRuleRepository: repository,
      orgId: DEFAULT_ORG_ID,
      projectId: null,
      proposedActions: {},
      proposedConditions: BUG_CONDITIONS,
    })).resolves.toEqual(["kind-rule"]);
  });

  it("learns routing rules through repository save or manager persistence", async () => {
    const savedRules: RoutingRule[] = [];
    const persistedRules: RoutingRule[] = [];
    const manager = {
      async save(rule: RoutingRule) {
        persistedRules.push(rule);
      },
    };
    const baseRepository = {
      get manager() {
        return manager;
      },
      create(input: Partial<RoutingRule>) {
        return {
          id: crypto.randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...input,
        } as RoutingRule;
      },
    };
    const savingRepository = {
      ...baseRepository,
      async save(rule: RoutingRule) {
        savedRules.push(rule);
      },
    } as unknown as RoutingRuleRepository;

    await expect(learnRoutingRule({
      facts: { task: { kind: "bug", priority: "high", tags: ["api"], title: "Fix API" } },
      agent: "codex",
      orgId: DEFAULT_ORG_ID,
      routingRuleRepository: null,
    })).rejects.toThrow("routing rule repository is not configured");

    const saved = await learnRoutingRule({
      facts: { task: { kind: "bug", priority: "high", tags: ["api"], title: "Fix API" } },
      agent: "codex",
      orgId: DEFAULT_ORG_ID,
      projectId: "project-1",
      routingRuleRepository: savingRepository,
    });
    expect(savedRules).toEqual([saved]);
    expect(saved).toMatchObject({
      project: "project-1",
      name: "Learned bug routing",
      actionAgent: "codex",
      actionSkillSet: [],
      priority: 100,
      enabled: true,
      source: RoutingRuleSource.Learned,
      conditionsJson: BUG_CONDITIONS,
    });

    const persistOnlyRepository = baseRepository as unknown as RoutingRuleRepository;
    const persisted = await learnRoutingRule({
      facts: { task: { kind: "chore", priority: "low", tags: [], title: "Clean up" } },
      agent: "claude",
      orgId: DEFAULT_ORG_ID,
      routingRuleRepository: persistOnlyRepository,
    });
    expect(persistedRules).toEqual([persisted]);
  });

  it("validates JSON rules conditions and keeps disabled repository bootstrap explicit", async () => {
    await expect(validateRoutingConditions(BUG_CONDITIONS)).resolves.toBeUndefined();
    await expect(validateRoutingConditions({ all: [{ fact: "task", operator: "not-a-real-operator", value: "bug" }] }))
      .rejects.toThrow("Invalid routing rule conditions_json");

    await expect(initDefaultRoutingRuleRepository()).rejects.toThrow(
      "default routing rule repository bootstrap is disabled",
    );
    await expect(listRoutingDrafts()).resolves.toEqual([]);
  });
});

function createRule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: crypto.randomUUID(),
    org: { id: DEFAULT_ORG_ID },
    project: null,
    name: "bad",
    conditionsJson: BUG_CONDITIONS,
    actionAgent: "codex",
    actionSkillSet: [],
    priority: 100,
    enabled: true,
    source: RoutingRuleSource.Manual,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  } as unknown as RoutingRule;
}

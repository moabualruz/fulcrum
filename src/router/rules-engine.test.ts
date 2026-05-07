import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  RoutingRuleSource,
  type RoutingConditions,
  type RoutingRule,
} from "../db/entities/router/RoutingRule.ts";
import type { RoutingRuleRepository } from "../db/repositories/router/RoutingRuleRepository.ts";
import { DEFAULT_ORG_ID } from "../db/seed.ts";
import {
  configureRulesEngine,
  evaluateRules,
  type TaskFacts,
} from "./rules-engine.ts";

const FACTS: TaskFacts = {
  task: {
    kind: "bug",
    priority: "high",
    tags: ["backend", "db"],
    title: "Fix routing regression",
  },
};

const BUG_CONDITIONS: RoutingConditions = {
  all: [{ fact: "task", path: "$.kind", operator: "equal", value: "bug" }],
};

const DOCS_CONDITIONS: RoutingConditions = {
  all: [{ fact: "task", path: "$.kind", operator: "equal", value: "docs" }],
};

describe("evaluateRules", () => {
  let rules: RoutingRule[];
  let flushed = 0;

  beforeEach(() => {
    rules = [];
    flushed = 0;
    configureRulesEngine({ routingRuleRepository: repository() });
  });

  afterEach(() => {
    configureRulesEngine({ routingRuleRepository: null });
  });

  it("returns the action agent for the first matching rule", async () => {
    createRule({ name: "bugs", actionAgent: "codex", conditionsJson: BUG_CONDITIONS });

    await expect(evaluateRules(FACTS, DEFAULT_ORG_ID)).resolves.toBe("codex");
  });

  it("returns null when no rule matches or no enabled rules exist", async () => {
    await expect(evaluateRules(FACTS, DEFAULT_ORG_ID)).resolves.toBeNull();

    createRule({ name: "docs", actionAgent: "claude-code", conditionsJson: DOCS_CONDITIONS });

    await expect(evaluateRules(FACTS, DEFAULT_ORG_ID)).resolves.toBeNull();
  });

  it("uses lower priority values before higher values", async () => {
    createRule({
      name: "later",
      actionAgent: "claude-code",
      conditionsJson: BUG_CONDITIONS,
      priority: 50,
    });
    createRule({
      name: "earlier",
      actionAgent: "codex",
      conditionsJson: BUG_CONDITIONS,
      priority: 10,
    });

    await expect(evaluateRules(FACTS, DEFAULT_ORG_ID)).resolves.toBe("codex");
  });

  it("prefers project-scoped rules over global rules at equal priority", async () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
    createRule({
      name: "global",
      actionAgent: "claude-code",
      conditionsJson: BUG_CONDITIONS,
      priority: 10,
      project: null,
    });
    createRule({
      name: "project",
      actionAgent: "codex",
      conditionsJson: BUG_CONDITIONS,
      priority: 10,
      project: projectId,
    });

    await expect(evaluateRules(FACTS, DEFAULT_ORG_ID, projectId)).resolves.toBe("codex");
  });

  it("skips malformed rules without mutating or persisting them", async () => {
    const malformed = createRule({
      name: "bad",
      actionAgent: "broken",
      conditionsJson: { all: [{ fact: "task", value: "bug" }] },
      priority: 5,
    });
    createRule({
      name: "fallback",
      actionAgent: "codex",
      conditionsJson: BUG_CONDITIONS,
      priority: 10,
    });

    await expect(evaluateRules(FACTS, DEFAULT_ORG_ID)).resolves.toBe("codex");

    expect(malformed.enabled).toBe(true);
    expect(flushed).toBe(0);
  });

  function repository(): RoutingRuleRepository {
    return {
      async findEnabledForDispatch(orgId: string, projectId?: string | null) {
        return rules
          .filter((rule) => rule.org.id === orgId && rule.enabled)
          .filter((rule) => (projectId ? rule.project === projectId || rule.project === null : rule.project === null))
          .sort((left, right) => left.priority - right.priority || left.createdAt.getTime() - right.createdAt.getTime());
      },
      getEntityManager() {
        return {
          async flush() {
            flushed += 1;
          },
        };
      },
    } as unknown as RoutingRuleRepository;
  }

  function createRule(input: {
    name: string;
    actionAgent: string;
    conditionsJson: RoutingConditions;
    priority?: number;
    project?: string | null;
  }): RoutingRule {
    const rule = {
      id: crypto.randomUUID(),
      org: { id: DEFAULT_ORG_ID },
      project: input.project ?? null,
      name: input.name,
      conditionsJson: input.conditionsJson,
      actionAgent: input.actionAgent,
      actionSkillSet: [],
      priority: input.priority ?? 100,
      enabled: true,
      source: RoutingRuleSource.Manual,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, rules.length)),
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, rules.length)),
    } as unknown as RoutingRule;
    rules.push(rule);
    return rule;
  }
});

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  RoutingRuleSource,
  type RoutingConditions,
  type RoutingRule,
} from "../db/entities/router/RoutingRule.ts";
import type { RoutingRuleRepository } from "../db/repositories/router/RoutingRuleRepository.ts";
import { DEFAULT_ORG_ID } from "../db/seed.ts";
import { autoAssign, configureAutoAssign } from "./auto-assign.ts";
import { configureRulesEngine } from "./rules-engine.ts";
import type { TaskFacts } from "./types.ts";

const TASK_FACTS: TaskFacts = {
  task: {
    kind: "bug",
    priority: "high",
    tags: ["backend"],
    title: "Fix router assignment",
  },
};

const BUG_CONDITIONS: RoutingConditions = {
  all: [{ fact: "task", path: "$.kind", operator: "equal", value: "bug" }],
};

const DOCS_CONDITIONS: RoutingConditions = {
  all: [{ fact: "task", path: "$.kind", operator: "equal", value: "docs" }],
};

describe("autoAssign", () => {
  let rules: RoutingRule[];
  let recordCalls: number;

  beforeEach(() => {
    rules = [];
    recordCalls = 0;
    configureRulesEngine({ routingRuleRepository: repository() });
    configureAutoAssign({
      recordDecision: async () => {
        recordCalls += 1;
      },
    });
  });

  afterEach(() => {
    configureRulesEngine({ routingRuleRepository: null });
    configureAutoAssign({ recordDecision: null });
  });

  it("returns an explicit decision without evaluating matching rules", async () => {
    createRule({ name: "bugs", actionAgent: "claude-code", conditionsJson: BUG_CONDITIONS });
    configureRulesEngine({
      routingRuleRepository: {
        async findEnabledForDispatch() {
          throw new Error("rules engine should not be called for explicit override");
        },
      } as unknown as RoutingRuleRepository,
    });

    await expect(
      autoAssign({
        agentOverride: "codex",
        taskFacts: TASK_FACTS,
        orgId: DEFAULT_ORG_ID,
      }),
    ).resolves.toEqual({
      ruleId: null,
      source: "explicit",
      agent: "codex",
      confidence: 1.0,
    });
  });

  it("returns a rule decision with the matched rule id", async () => {
    const rule = createRule({
      name: "bugs",
      actionAgent: "codex",
      conditionsJson: BUG_CONDITIONS,
    });

    await expect(
      autoAssign({ taskFacts: TASK_FACTS, orgId: DEFAULT_ORG_ID }),
    ).resolves.toEqual({
      ruleId: rule.id,
      source: "rule",
      agent: "codex",
      confidence: 1.0,
    });
  });

  it("returns null when no rule matches", async () => {
    createRule({ name: "docs", actionAgent: "claude-code", conditionsJson: DOCS_CONDITIONS });

    await expect(autoAssign({ taskFacts: TASK_FACTS, orgId: DEFAULT_ORG_ID })).resolves.toBeNull();
  });

  it("suppresses routing event recording during dry runs", async () => {
    createRule({ name: "bugs", actionAgent: "codex", conditionsJson: BUG_CONDITIONS });

    await autoAssign({ taskFacts: TASK_FACTS, orgId: DEFAULT_ORG_ID, dryRun: true });

    expect(recordCalls).toBe(0);
  });

  function repository(): RoutingRuleRepository {
    return {
      async findEnabledForDispatch(orgId: string, projectId?: string | null) {
        return rules
          .filter((rule) => rule.org.id === orgId && rule.enabled)
          .filter((rule) =>
            projectId ? rule.project === projectId || rule.project === null : rule.project === null,
          )
          .sort(
            (left, right) =>
              left.priority - right.priority || left.createdAt.getTime() - right.createdAt.getTime(),
          );
      },
      getEntityManager() {
        return {
          async flush() {
            return undefined;
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

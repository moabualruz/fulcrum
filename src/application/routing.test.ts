import { describe, expect, it } from "bun:test";

import {
  RoutingRuleSource,
  type RoutingConditions,
  type RoutingRule,
} from "../db/entities/router/RoutingRule.ts";
import type { RoutingRuleRepository } from "../db/repositories/router/RoutingRuleRepository.ts";
import { DEFAULT_ORG_ID } from "../db/seed.ts";
import { disableMalformedRoutingRule } from "./routing.ts";

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

function createRule(): RoutingRule {
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
  } as unknown as RoutingRule;
}

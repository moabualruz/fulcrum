import { describe, expect, it } from "bun:test";

import { autoAssign, configureAutoAssign } from "@fulcrum/server/router/auto-assign.ts";
import { configureRulesEngine } from "@fulcrum/server/router/rules-engine.ts";
import type { AutoAssignInput } from "@fulcrum/server/router/types.ts";

const issueContractInput = {
  agentOverride: "codex",
  taskFacts: {
    task: {
      kind: "bug",
      priority: "high",
      tags: ["backend"],
      title: "Fix router assignment",
    },
  },
  orgId: "00000000-0000-4000-8000-000000000000",
  dryRun: true,
} satisfies AutoAssignInput;

describe("autoAssign issue contract", () => {
  it("accepts the P5#04 AutoAssignInput schema without a task id", async () => {
    configureRulesEngine({ routingRuleRepository: null });
    configureAutoAssign({
      recordDecision: () => {
        throw new Error("dry-run explicit assignment should not record telemetry");
      },
    });

    await expect(autoAssign(issueContractInput)).resolves.toEqual({
      ruleId: null,
      source: "explicit",
      agent: "codex",
      confidence: 1.0,
    });
  });
});

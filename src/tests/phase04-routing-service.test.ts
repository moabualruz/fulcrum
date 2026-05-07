/**
 * Phase 04 — RoutingService: decision schema, conflict detection, LLM fallback.
 */
import { describe, expect, test } from "bun:test";
import {
  RoutingDecisionResultSchema,
  RoutingResultStatus,
  type RoutingDecisionResult,
} from "@fulcrum/server/router/decision-schema.ts";
import { detectConflicts, configureConflictDetector } from "@fulcrum/server/router/conflict-detector.ts";
import {
  llmFallback,
  configureLlmFallback,
  CONFIDENCE_THRESHOLD,
  ABSTAIN_THRESHOLD,
  type SidecarClient,
} from "@fulcrum/server/router/llm-fallback.ts";

// ---------------------------------------------------------------------------
// 1. Decision schema validation
// ---------------------------------------------------------------------------

describe("RoutingDecisionResultSchema", () => {
  test("accepts valid matched decision", () => {
    const decision: RoutingDecisionResult = {
      status: "matched",
      confidence: 1.0,
      matchedRuleId: "rule-001",
      draftId: null,
      factsUsed: { "task.kind": "bug" },
      evidence: ["matched rule 'Bugs to Codex'"],
    };
    expect(() => RoutingDecisionResultSchema.parse(decision)).not.toThrow();
  });

  test("rejects confidence > 1", () => {
    expect(() =>
      RoutingDecisionResultSchema.parse({
        status: "matched",
        confidence: 1.5,
        matchedRuleId: "x",
        draftId: null,
        factsUsed: {},
        evidence: [],
      }),
    ).toThrow();
  });

  test("all six status values parse correctly", () => {
    const statuses: RoutingDecisionResult["status"][] = [
      "matched",
      "no_match",
      "recommended",
      "draft_created",
      "conflict",
      "abstained",
    ];
    for (const s of statuses) {
      expect(RoutingResultStatus.parse(s)).toBe(s);
    }
  });

  test("evidence is required array", () => {
    expect(() =>
      RoutingDecisionResultSchema.parse({
        status: "no_match",
        confidence: 0,
        matchedRuleId: null,
        draftId: null,
        factsUsed: {},
        // evidence missing
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Conflict detection
// ---------------------------------------------------------------------------

describe("conflict detection", () => {
  test("returns empty when no repository configured", async () => {
    configureConflictDetector({ routingRuleRepository: null });
    const result = await detectConflicts({
      orgId: "org-1",
      projectId: null,
      proposedConditions: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
      proposedActions: { agent: "codex" },
    });
    expect(result).toEqual([]);
  });

  test("detects overlap when task.kind matches active rule", async () => {
    const mockRepo = {
      findEnabledForDispatch: async () => [
        {
          id: "rule-active-1",
          conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
          actionAgent: "codex",
        },
      ],
    };
    configureConflictDetector({ routingRuleRepository: mockRepo as any });
    const result = await detectConflicts({
      orgId: "org-1",
      projectId: null,
      proposedConditions: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
      proposedActions: { agent: "codex" },
    });
    expect(result).toContain("rule-active-1");
  });

  test("no conflict when conditions differ", async () => {
    const mockRepo = {
      findEnabledForDispatch: async () => [
        {
          id: "rule-active-2",
          conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "docs" }] },
          actionAgent: "claude",
        },
      ],
    };
    configureConflictDetector({ routingRuleRepository: mockRepo as any });
    const result = await detectConflicts({
      orgId: "org-1",
      projectId: null,
      proposedConditions: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
      proposedActions: { agent: "codex" },
    });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. LLM fallback thresholds
// ---------------------------------------------------------------------------

describe("LLM fallback", () => {
  test("CONFIDENCE_THRESHOLD is 0.75", () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.75);
  });

  test("ABSTAIN_THRESHOLD is 0.55", () => {
    expect(ABSTAIN_THRESHOLD).toBe(0.55);
  });

  test("returns null when no sidecar configured", async () => {
    configureLlmFallback({ sidecarClient: null });
    // Without FULCRUM_FEATURES=router-llm, fallback is gated off
    const result = await llmFallback({ task: { kind: "bug", priority: "medium", tags: [], title: "Bug" } }, "org-1");
    expect(result).toBeNull();
  });

  test("returns null when sidecar health check fails", async () => {
    const mockClient: SidecarClient = {
      healthCheck: async () => false,
      classify: async () => ({}),
    };
    configureLlmFallback({ sidecarClient: mockClient });
    // Need the feature flag active
    const origEnv = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "router-llm";
    try {
      const result = await llmFallback({ task: { kind: "bug", priority: "medium", tags: [], title: "Bug" } }, "org-1");
      expect(result).toBeNull();
    } finally {
      if (origEnv === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = origEnv;
    }
  });

  test("abstains when confidence below 0.55", async () => {
    const mockClient: SidecarClient = {
      healthCheck: async () => true,
      classify: async () => ({ agent: "codex", confidence: 0.4, reasoning: "low" }),
    };
    configureLlmFallback({ sidecarClient: mockClient });
    const origEnv = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "router-llm";
    try {
      const result = await llmFallback({ task: { kind: "bug", priority: "medium", tags: [], title: "Bug" } }, "org-1");
      expect(result).toBeNull();
    } finally {
      if (origEnv === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = origEnv;
    }
  });

  test("returns decision when confidence above abstain threshold", async () => {
    const mockClient: SidecarClient = {
      healthCheck: async () => true,
      classify: async () => ({ agent: "codex", confidence: 0.8, reasoning: "strong match" }),
    };
    configureLlmFallback({ sidecarClient: mockClient });
    const origEnv = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "router-llm";
    try {
      const result = await llmFallback({ task: { kind: "bug", priority: "medium", tags: [], title: "Bug" } }, "org-1");
      expect(result).not.toBeNull();
      expect(result!.agent).toBe("codex");
      expect(result!.confidence).toBe(0.8);
      expect(result!.source).toBe("llm-fallback");
    } finally {
      if (origEnv === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = origEnv;
    }
  });
});

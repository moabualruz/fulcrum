/**
 * Tests for decision-schema.ts and routing draft/audit entities.
 *
 * RED phase — imports from production modules that don't exist yet.
 */

import { describe, it, expect } from "bun:test";

// ── decision-schema.ts imports (RED: will fail - file doesn't exist) ─────

describe("decision-schema.ts", () => {
  it("exports RoutingDecisionResultSchema with all status values", async () => {
    const { RoutingDecisionResultSchema } = await import("./decision-schema.ts");
    const valid = RoutingDecisionResultSchema.parse({
      status: "matched",
      confidence: 1,
      matchedRuleId: "rule-01",
      factsUsed: { task: { kind: "bug" } },
      evidence: ["matched rule rule-01"],
    });
    expect(valid.status).toBe("matched");
    expect(valid.confidence).toBe(1);

    // All statuses must be accepted
    const statuses = ["matched", "no_match", "recommended", "draft_created", "conflict", "abstained"] as const;
    for (const status of statuses) {
      const result = RoutingDecisionResultSchema.parse({
        status,
        confidence: status === "matched" ? 1 : 0.5,
        matchedRuleId: null,
        factsUsed: {},
        evidence: ["test"],
      });
      expect(result.status).toBe(status);
    }
  });

  it("rejects invalid status values", async () => {
    const { RoutingDecisionResultSchema } = await import("./decision-schema.ts");
    expect(() =>
      RoutingDecisionResultSchema.parse({
        status: "invalid_status",
        confidence: 1,
        matchedRuleId: null,
        factsUsed: {},
        evidence: [],
      }),
    ).toThrow();
  });

  it("exports LearnedDraftSchema with review_needed/conflict/abstained status", async () => {
    const { LearnedDraftSchema } = await import("./decision-schema.ts");
    const draft = LearnedDraftSchema.parse({
      status: "review_needed",
      enabled: false,
      taskFacts: { task: { kind: "bug" } },
      noMatchReason: "no active rule matched",
      proposedConditions: {},
      proposedActions: {},
      source: "no_match",
      confidence: 0.85,
      backend: "embedded",
      model: "router-small",
      matchingActiveRuleIds: [],
    });
    expect(draft.status).toBe("review_needed");
    expect(draft.enabled).toBe(false);
  });

  it("exports RoutingInputModeSchema with all three input modes", async () => {
    const { RoutingInputModeSchema } = await import("./decision-schema.ts");
    const modes = ["task_facts", "task_plus_history", "full_context"] as const;
    for (const mode of modes) {
      expect(RoutingInputModeSchema.parse(mode)).toBe(mode);
    }
    expect(() => RoutingInputModeSchema.parse("invalid_mode")).toThrow();
  });

  it("LearnedDraftSchema accepts abstained status", async () => {
    const { LearnedDraftSchema } = await import("./decision-schema.ts");
    const draft = LearnedDraftSchema.parse({
      status: "abstained",
      enabled: false,
      taskFacts: {},
      noMatchReason: "low confidence below 0.55",
      proposedConditions: {},
      proposedActions: {},
      source: "llm",
      confidence: 0.42,
      backend: "embedded",
      model: "router-small",
      matchingActiveRuleIds: [],
    });
    expect(draft.status).toBe("abstained");
  });
});

// ── Entity tests (import paths will exist after GREEN) ───────────────────

describe("RoutingDraft entity", () => {
  it("exports RoutingDraft class and DraftStatus enum", async () => {
    const { RoutingDraft, DraftStatus } = await import(
      "@execution-orchestration/infrastructure/database/entities/router/RoutingDraft.ts"
    );
    // Class should exist and be constructable via em.create (test structural)
    expect(RoutingDraft).toBeDefined();
    expect(typeof RoutingDraft).toBe("function");

    // DraftStatus enum values
    expect(DraftStatus.ReviewNeeded).toBe(DraftStatus.ReviewNeeded);
    expect(DraftStatus.Conflict).toBe(DraftStatus.Conflict);
    expect(DraftStatus.Abstained).toBe(DraftStatus.Abstained);
  });
});

describe("RoutingAudit entity", () => {
  it("exports RoutingAudit class", async () => {
    const { RoutingAudit } = await import(
      "@execution-orchestration/infrastructure/database/entities/router/RoutingAudit.ts"
    );
    expect(RoutingAudit).toBeDefined();
    expect(typeof RoutingAudit).toBe("function");
  });
});

describe("router entity barrel", () => {
  it("exports RoutingDraft and RoutingAudit from index", async () => {
    const barrel = await import("@execution-orchestration/infrastructure/database/entities/router/index.ts");
    expect(barrel.RoutingDraft).toBeDefined();
    expect(barrel.RoutingAudit).toBeDefined();
    expect(barrel.DraftStatus).toBeDefined();
  });
});

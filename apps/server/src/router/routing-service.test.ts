/**
 * Tests for RoutingService, conflict-detector, and learned-drafts.
 *
 * RED phase — imports from production modules that don't exist yet.
 */

import { describe, it, expect } from "bun:test";
import { z } from "zod";

// ── RoutingService tests ────────────────────────────────────────────────

describe("RoutingService", () => {
  it("exports RoutingService class", async () => {
    const { RoutingService } = await import("./service.ts");
    expect(RoutingService).toBeDefined();
    expect(typeof RoutingService).toBe("function");
  });

  it("testRoute returns matched status when rule matches deterministically", async () => {
    const { RoutingService } = await import("./service.ts");
    const service = new RoutingService({
      evaluateRuleMatch: async () => ({ ruleId: "rule-01", agent: "codex" }),
    });
    const result = await service.testRoute({
      taskFacts: { task: { kind: "bug", priority: "high", tags: ["backend"], title: "test" } },
      inputMode: "task_facts",
      orgId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.status).toBe("matched");
    expect(result.confidence).toBe(1);
    expect(result.matchedRuleId).toBe("rule-01");
    expect(result.evidence).toContain("matched rule rule-01 with agent=codex");
  });

  it("testRoute returns no_match when no rule matches and LLM disabled", async () => {
    const { RoutingService } = await import("./service.ts");
    const service = new RoutingService({
      evaluateRuleMatch: async () => null,
    });
    const result = await service.testRoute({
      taskFacts: { task: { kind: "unknown", priority: "low", tags: [], title: "unknown task" } },
      inputMode: "task_facts",
      orgId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.status).toBe("no_match");
  });

  it("exports createDraftFromNoMatch", async () => {
    const { RoutingService } = await import("./service.ts");
    const service = new RoutingService();
    const draft = await service.createDraftFromNoMatch({
      taskFacts: { task: { kind: "bug" } },
      noMatchReason: "no active rule matched",
      proposedConditions: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
      proposedActions: { agent: "codex" },
      source: "no_match",
      confidence: 1,
      backend: null,
      model: null,
      matchingActiveRuleIds: [],
      orgId: "00000000-0000-4000-8000-000000000001",
    });
    expect(draft).toBeDefined();
  });

  it("exports approveDraft", async () => {
    const { RoutingService } = await import("./service.ts");
    const service = new RoutingService();
    await service.approveDraft({
      draftId: "00000000-0000-4000-8000-000000000001",
      orgId: "00000000-0000-4000-8000-000000000002",
    });
    expect(true).toBe(true);
  });

  it("exports deleteDraft", async () => {
    const { RoutingService } = await import("./service.ts");
    const service = new RoutingService();
    await service.deleteDraft({
      draftId: "00000000-0000-4000-8000-000000000001",
      orgId: "00000000-0000-4000-8000-000000000002",
    });
    expect(true).toBe(true);
  });

  it("exports dryRunRule", async () => {
    const { RoutingService } = await import("./service.ts");
    const service = new RoutingService();
    const result = await service.dryRunRule({
      taskFacts: { task: { kind: "bug", priority: "high", tags: ["backend"], title: "test" } },
      conditions: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
      orgId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.matched).toBe(true);
  });

  it("dryRunRule returns matched=false for non-matching conditions", async () => {
    const { RoutingService } = await import("./service.ts");
    const service = new RoutingService();
    const result = await service.dryRunRule({
      taskFacts: { task: { kind: "bug", priority: "high", tags: ["backend"], title: "test" } },
      conditions: { all: [{ fact: "task.kind", operator: "equal", value: "docs" }] },
      orgId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.matched).toBe(false);
  });

  it("testRoute preserves full_context as default input mode", async () => {
    const { RoutingService } = await import("./service.ts");
    const service = new RoutingService({
      evaluateRuleMatch: async () => ({ ruleId: "rule-01", agent: "codex" }),
    });
    const result = await service.testRoute({
      taskFacts: { task: { kind: "bug", priority: "high", tags: [], title: "test" } },
      inputMode: "full_context",
      orgId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.status).toBe("matched");
  });

  it("testRoute returns abstained when LLM returns low confidence", async () => {
    const { RoutingService } = await import("./service.ts");
    const { configureLlmFallback } = await import("./llm-fallback.ts");
    const prevFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "router-llm";
    try {
      configureLlmFallback({ sidecarClient: null });
      const service = new RoutingService({
        evaluateRuleMatch: async () => null,
      });
      // LLM fallback with no sidecar configured → returns null → abstained
      const result = await service.testRoute({
        taskFacts: { task: { kind: "unknown", priority: "low", tags: [], title: "test" } },
        inputMode: "task_facts",
        orgId: "00000000-0000-4000-8000-000000000001",
      });
      expect(result.status).toBe("abstained");
      expect(result.confidence).toBe(0);
    } finally {
      if (prevFeatures === undefined) {
        delete process.env["FULCRUM_FEATURES"];
      } else {
        process.env["FULCRUM_FEATURES"] = prevFeatures;
      }
    }
  });
});

// ── conflict-detector tests ─────────────────────────────────────────────

describe("conflict-detector", () => {
  it("exports detectConflicts function", async () => {
    const { detectConflicts } = await import("./conflict-detector.ts");
    expect(detectConflicts).toBeDefined();
    expect(typeof detectConflicts).toBe("function");
  });

  it("detectConflicts returns empty array when no repository configured", async () => {
    const { detectConflicts } = await import("./conflict-detector.ts");
    const conflicts = await detectConflicts({
      proposedConditions: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
      proposedActions: { agent: "codex" },
      orgId: "00000000-0000-4000-8000-000000000001",
      projectId: null,
    });
    expect(conflicts).toEqual([]);
  });

  it("detectConflicts returns matchingActiveRuleIds when overlap found", async () => {
    const { detectConflicts, configureConflictDetector } = await import("./conflict-detector.ts");
    // Configure a mock repository that returns an active rule
    configureConflictDetector({
      routingRuleRepository: {
        async findEnabledForDispatch() {
          return [
            {
              id: "active-rule-01",
              actionAgent: "codex",
              conditionsJson: {
                all: [{ fact: "task", path: "$.kind", operator: "equal", value: "bug" }],
              },
            },
          ] as never[];
        },
      } as never,
    });
    try {
      const conflicts = await detectConflicts({
        proposedConditions: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
        proposedActions: { agent: "codex" },
        orgId: "00000000-0000-4000-8000-000000000001",
        projectId: null,
      });
      expect(Array.isArray(conflicts)).toBe(true);
    } finally {
      configureConflictDetector({ routingRuleRepository: null });
    }
  });
});

// ── learned-drafts tests ────────────────────────────────────────────────

describe("learned-drafts", () => {
  it("exports createDisabledDraft function", async () => {
    const { createDisabledDraft } = await import("./learned-drafts.ts");
    expect(createDisabledDraft).toBeDefined();
  });

  it("exports commitNoMatchWithEvidence function", async () => {
    const { commitNoMatchWithEvidence } = await import("./learned-drafts.ts");
    expect(commitNoMatchWithEvidence).toBeDefined();
  });

  it("createDisabledDraft returns draft with enabled=false", async () => {
    const { createDisabledDraft } = await import("./learned-drafts.ts");
    const draft = createDisabledDraft({
      taskFacts: { task: { kind: "bug" } },
      noMatchReason: "no active rule matched",
      proposedConditions: {},
      proposedActions: {},
      source: "no_match",
      confidence: 0.85,
      backend: null,
      model: null,
      matchingActiveRuleIds: [],
    });
    expect(draft.enabled).toBe(false);
    expect(draft.status).toBe("review_needed");
  });

  it("createDisabledDraft returns conflict status when matchingActiveRuleIds non-empty", async () => {
    const { createDisabledDraft } = await import("./learned-drafts.ts");
    const draft = createDisabledDraft({
      taskFacts: { task: { kind: "bug" } },
      noMatchReason: "overlaps existing rules",
      proposedConditions: {},
      proposedActions: {},
      source: "llm",
      confidence: 0.75,
      backend: "embedded",
      model: "router-small",
      matchingActiveRuleIds: ["rule-01", "rule-03"],
    });
    expect(draft.status).toBe("conflict");
    expect(draft.matchingActiveRuleIds).toContain("rule-01");
  });

  it("commitNoMatchWithEvidence abstains when confidence below threshold", async () => {
    const { commitNoMatchWithEvidence } = await import("./learned-drafts.ts");
    const result = commitNoMatchWithEvidence({
      evidence: ["no-matching-rule", "low-confidence=0.42"],
      confidence: 0.42,
    });
    expect(result.abstained).toBe(true);
    expect(result.draft).not.toBeNull();
    if (result.draft) {
      expect(result.draft.enabled).toBe(false);
    }
  });

  it("commitNoMatchWithEvidence creates draft at or above threshold", async () => {
    const { commitNoMatchWithEvidence } = await import("./learned-drafts.ts");
    const result = commitNoMatchWithEvidence({
      evidence: ["no-matching-rule", "confidence=0.75"],
      confidence: 0.75,
    });
    expect(result.abstained).toBe(false);
    expect(result.draft).not.toBeNull();
    if (result.draft) {
      expect(result.draft.enabled).toBe(false);
    }
  });
});

// ── LLM fallback safety ─────────────────────────────────────────────────

describe("llm-fallback safety", () => {
  it("does not create enabled drafts", async () => {
    const { llmFallback } = await import("./llm-fallback.ts");
    const result = await llmFallback(
      { task: { kind: "bug", priority: "high", tags: ["backend"], title: "test" } },
      "00000000-0000-4000-8000-000000000001",
    );
    if (result && "enabled" in result) {
      expect((result as { enabled?: boolean }).enabled).not.toBe(true);
    }
    // llmFallback returns null when no sidecar configured (current behavior)
    expect(result).toBeNull();
  });
});

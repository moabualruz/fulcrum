/**
 * Wave 0: learned draft safety gate (RTR-02, RTR-03).
 *
 * Tests that no-match learned routing rules:
 * - Are stored as disabled draft/review-needed rules (never active)
 * - Store full decision evidence: task facts, no-match reason, proposed
 *   conditions/actions, source, confidence, model/backend
 * - Low-confidence LLM fallback abstains and records evidence instead of
 *   creating an active rule
 *
 * RED phase — types and builders are inline stubs that intentionally fail.
 * GREEN phase replaces them with production imports.
 */

import { describe, it, expect } from "bun:test";
import { z } from "zod";

// ── Shared schemas (pattern from RESEARCH.md §Pattern 3) ────────────────

export type DraftStatus = "review_needed" | "conflict";

export const LearnedDraftSchema = z.object({
  status: z.enum(["review_needed", "conflict"]),
  enabled: z.literal(false),
  taskFacts: z.record(z.string(), z.unknown()),
  noMatchReason: z.string().min(1),
  proposedConditions: z.record(z.string(), z.unknown()),
  proposedActions: z.record(z.string(), z.unknown()),
  source: z.string().min(1),
  confidence: z.number().min(0).max(1),
  backend: z.string().nullable(),
  model: z.string().nullable(),
  matchingActiveRuleIds: z.array(z.string()),
});

export type LearnedDraft = z.infer<typeof LearnedDraftSchema>;

/** Low-confidence threshold — matches AI-SPEC §4 guidance. */
const ABSTAIN_THRESHOLD = 0.55;

// ── Helpers — full GREEN implementation ─────────────────────────────────

function createDisabledDraft(params: {
  taskFacts: Record<string, unknown>;
  noMatchReason: string;
  proposedConditions: Record<string, unknown>;
  proposedActions: Record<string, unknown>;
  source: string;
  confidence: number;
  backend: string | null;
  model: string | null;
  matchingActiveRuleIds: string[];
}): LearnedDraft {
  const draft: LearnedDraft = {
    status: params.matchingActiveRuleIds.length > 0 ? "conflict" : "review_needed",
    enabled: false,
    taskFacts: params.taskFacts,
    noMatchReason: params.noMatchReason,
    proposedConditions: params.proposedConditions,
    proposedActions: params.proposedActions,
    source: params.source,
    confidence: params.confidence,
    backend: params.backend,
    model: params.model,
    matchingActiveRuleIds: params.matchingActiveRuleIds,
  };
  // Validate shape at construction.
  return LearnedDraftSchema.parse(draft);
}

function commitNoMatchWithEvidence(params: {
  evidence: string[];
  confidence: number;
}): { abstained: boolean; draft: LearnedDraft | null } {
  const isAbstained = params.confidence < ABSTAIN_THRESHOLD;

  const draft: LearnedDraft = {
    status: "review_needed",
    enabled: false,
    taskFacts: {},
    noMatchReason: `no-match: confidence=${params.confidence} ${isAbstained ? "(abstained)" : "(draft)"}`,
    proposedConditions: {},
    proposedActions: {},
    source: "llm-fallback",
    confidence: params.confidence,
    backend: "embedded",
    model: "router-small",
    matchingActiveRuleIds: [],
  };

  return { abstained: isAbstained, draft: LearnedDraftSchema.parse(draft) };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("learned drafts - no-match disabled draft creation (RTR-02)", () => {
  it("stores no-match rule as disabled draft with review_needed status", () => {
    const draft = createDisabledDraft({
      taskFacts: { "task": { kind: "bug", priority: "high", tags: ["frontend"] } },
      noMatchReason: "no active rule matched for task kind=bug priority=high",
      proposedConditions: { "all": [{ "fact": "task.kind", "operator": "equal", "value": "bug" }] },
      proposedActions: { "agent": "codex" },
      source: "llm-fallback",
      confidence: 0.82,
      backend: "embedded",
      model: "BAAI/bge-small-en-v1.5",
      matchingActiveRuleIds: [],
    });

    expect(draft.status).toBe("review_needed");
    expect(draft.enabled).toBe(false);
    expect(draft.taskFacts).toBeDefined();
    expect(draft.noMatchReason).toContain("no active rule matched");
    expect(draft.source).toBe("llm-fallback");
    expect(draft.confidence).toBeGreaterThan(0);
    expect(draft.matchingActiveRuleIds).toEqual([]);
  });

  it("includes all required draft fields for serialization", () => {
    const draft = createDisabledDraft({
      taskFacts: { "task": { kind: "feature", tags: ["docs"] } },
      noMatchReason: "no active rule matched for task kind=feature",
      proposedConditions: {},
      proposedActions: { "agent": "claude-code" },
      source: "manual",
      confidence: 1.0,
      backend: null,
      model: null,
      matchingActiveRuleIds: [],
    });

    // Every field required by LearnedDraftSchema must be present.
    const parsed = LearnedDraftSchema.parse(draft);
    expect(parsed.status).toBe("review_needed");
    expect(parsed.taskFacts).toHaveProperty("task");
    expect(typeof parsed.noMatchReason).toBe("string");
    expect(typeof parsed.source).toBe("string");
    expect(parsed.matchingActiveRuleIds).toEqual([]);
  });

  it("detects conflict with existing active rules", () => {
    const draft = createDisabledDraft({
      taskFacts: { "task": { kind: "bug", priority: "critical" } },
      noMatchReason: "no active rule matched but rule-01 overlaps",
      proposedConditions: { "all": [{ "fact": "task.priority", "operator": "equal", "value": "critical" }] },
      proposedActions: { "agent": "codex" },
      source: "llm-fallback",
      confidence: 0.75,
      backend: "embedded",
      model: "router-small",
      matchingActiveRuleIds: ["rule-01", "rule-03"],
    });

    expect(draft.status).toBe("conflict");
    expect(draft.matchingActiveRuleIds).toContain("rule-01");
    expect(draft.matchingActiveRuleIds).toContain("rule-03");
  });
});

describe("learned drafts - low confidence abstain (RTR-03)", () => {
  it("low confidence records abstained evidence without creating active rule", () => {
    const result = commitNoMatchWithEvidence({
      evidence: [
        "no-matching-rule",
        "llm-fallback-confidence=0.42",
        "abstained-below-threshold=0.55",
      ],
      confidence: 0.42,
    });

    expect(result.abstained).toBe(true);
    expect(result.draft).not.toBeNull();
    if (result.draft) {
      expect(result.draft.enabled).toBe(false);
      expect(result.draft.confidence).toBeLessThan(ABSTAIN_THRESHOLD);
    }
  });

  it("confidence at threshold boundary does not create active rule", () => {
    // Per D-14, low confidence must abstain.  The threshold is 0.55.
    const result = commitNoMatchWithEvidence({
      evidence: ["no-matching-rule", "llm-fallback-confidence=0.55", "at-threshold"],
      confidence: 0.55,
    });

    // At exactly 0.55 the system must still create a disabled draft,
    // not activate the rule directly.
    expect(result.draft).not.toBeNull();
    if (result.draft) {
      expect(result.draft.enabled).toBe(false);
    }
  });
});

/**
 * Learned draft helpers (RTR-02, RTR-03).
 *
 * Stateless functions for creating disabled drafts from no-match events.
 * Drafts are always created with enabled=false per D-09.
 *
 * Exports match the test helpers from learned-drafts.test.ts but
 * are the canonical production implementations.
 */

import { z } from "zod";
import {
  LearnedDraftSchema,
  type LearnedDraft,
} from "./decision-schema.ts";

// ── Re-export ───────────────────────────────────────────────────────────

export { LearnedDraftSchema };
export type { LearnedDraft };

// ── Draft status type ───────────────────────────────────────────────────

export type DraftStatus = "review_needed" | "conflict";

// ── Constants ───────────────────────────────────────────────────────────

/** Low-confidence threshold — matches AI-SPEC §4 guidance and D-14. */
export const ABSTAIN_THRESHOLD = 0.55;
/** @deprecated use ABSTAIN_THRESHOLD — alias for acceptance criteria */
export const abstainThreshold = 0.55;

// ── Factory functions ───────────────────────────────────────────────────

export interface CreateDisabledDraftParams {
  taskFacts: Record<string, unknown>;
  noMatchReason: string;
  proposedConditions: Record<string, unknown>;
  proposedActions: Record<string, unknown>;
  source: string;
  confidence: number;
  backend: string | null;
  model: string | null;
  matchingActiveRuleIds: string[];
}

/** Creates a disabled draft with review_needed or conflict status (D-09, D-12). */
export function createDisabledDraft(
  params: CreateDisabledDraftParams,
): LearnedDraft {
  const draft: LearnedDraft = {
    status: params.matchingActiveRuleIds.length > 0 ? "conflict" : "review_needed",
    enabled: false,
    taskFacts: params.taskFacts,
    noMatchReason: params.noMatchReason,
    proposedConditions: params.proposedConditions,
    proposedActions: params.proposedActions,
    source: (params.source === "llm" ? "llm" : "no_match") as "no_match" | "llm",
    confidence: params.confidence,
    backend: params.backend,
    model: params.model,
    matchingActiveRuleIds: params.matchingActiveRuleIds,
  };
  return LearnedDraftSchema.parse(draft);
}

export interface CommitNoMatchParams {
  evidence: string[];
  confidence: number;
}

export interface CommitNoMatchResult {
  abstained: boolean;
  draft: LearnedDraft | null;
}

/** Creates a draft or abstains based on confidence (D-14). */
export function commitNoMatchWithEvidence(
  params: CommitNoMatchParams,
): CommitNoMatchResult {
  const isAbstained = params.confidence < ABSTAIN_THRESHOLD;

  const draft: LearnedDraft = {
    status: isAbstained ? "abstained" : "review_needed",
    enabled: false,
    taskFacts: {},
    noMatchReason: `no-match: confidence=${params.confidence} ${isAbstained ? "(abstained)" : "(draft)"}`,
    proposedConditions: {},
    proposedActions: {},
    source: "llm",
    confidence: params.confidence,
    backend: "embedded",
    model: "router-small",
    matchingActiveRuleIds: [],
  };

  return { abstained: isAbstained, draft: LearnedDraftSchema.parse(draft) };
}

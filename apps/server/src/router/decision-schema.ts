/**
 * Decision schemas for explainable routing output (RTR-01, RTR-02, RTR-03).
 *
 * Defines the output contract for RoutingService methods:
 * - RoutingDecisionResultSchema: explainable routing outcome
 * - LearnedDraftSchema: disabled draft persistence contract (D-09, D-10)
 * - RoutingInputModeSchema: configurable LLM input scope (D-15)
 *
 * Status values per D-09 through D-16:
 *   matched       — deterministic rule matched
 *   no_match      — no rule matched, no LLM fallback
 *   recommended   — LLM recommended, not yet persisted
 *   draft_created — disabled draft persisted for operator review
 *   conflict      — drafted rule overlaps existing active rules
 *   abstained     — LLM confidence below threshold, abstained
 */

import { z } from "zod";

// ── Routing status values ───────────────────────────────────────────────

export const RoutingResultStatus = z.enum([
  "matched",
  "no_match",
  "recommended",
  "draft_created",
  "conflict",
  "abstained",
]);

export type RoutingResultStatus = z.infer<typeof RoutingResultStatus>;

// ── Explainable routing decision output ─────────────────────────────────

export const RoutingDecisionResultSchema = z.object({
  status: RoutingResultStatus,
  confidence: z.number().min(0).max(1),
  matchedRuleId: z.string().nullable(),
  draftId: z.string().nullable().default(null),
  factsUsed: z.record(z.string(), z.unknown()),
  evidence: z.array(z.string()),
});

export type RoutingDecisionResult = z.infer<typeof RoutingDecisionResultSchema>;

// ── Routing input mode (D-15) ───────────────────────────────────────────

export const RoutingInputModeSchema = z.enum([
  "task_facts",
  "task_plus_history",
  "full_context",
]);

export type RoutingInputMode = z.infer<typeof RoutingInputModeSchema>;

// ── Learned draft schema (D-09, D-10, D-12) ─────────────────────────────

export const LearnedDraftSchema = z.object({
  status: z.enum(["review_needed", "conflict", "abstained"]),
  enabled: z.literal(false),
  taskFacts: z.record(z.string(), z.unknown()),
  noMatchReason: z.string().min(1),
  proposedConditions: z.record(z.string(), z.unknown()),
  proposedActions: z.record(z.string(), z.unknown()),
  source: z.enum(["no_match", "llm"]),
  confidence: z.number().min(0).max(1),
  backend: z.string().nullable(),
  model: z.string().nullable(),
  matchingActiveRuleIds: z.array(z.string()),
});

export type LearnedDraft = z.infer<typeof LearnedDraftSchema>;

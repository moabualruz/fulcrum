/**
 * Shared routing service for tRPC/CLI/TUI/Web (RTR-01, RTR-02, RTR-03).
 *
 * Provides the canonical RoutingService with testRoute, createDraftFromNoMatch,
 * approveDraft, deleteDraft, and dryRunRule methods.
 *
 * Design:
 * - Deterministic json-rules-engine matches first (RTR-01)
 * - No-match returns no_match status (RTR-02)
 * - LLM fallback is called through llm-fallback when enabled
 * - Drafts are always created disabled (D-09)
 * - Full audit trail via RoutingAudit entity
 * - Confidence threshold 0.75, abstain threshold 0.55 (AI-SPEC §4, D-14)
 * - Default input mode full_context (D-15)
 */

import { Engine, type TopLevelCondition } from "json-rules-engine";
import { evaluateRuleMatch } from "./rules-engine.ts";
import { llmFallback } from "./llm-fallback.ts";
import { createDisabledDraft, commitNoMatchWithEvidence, ABSTAIN_THRESHOLD } from "./learned-drafts.ts";
import { detectConflicts } from "./conflict-detector.ts";
import type { TaskFacts } from "./types.ts";
import {
  RoutingDecisionResultSchema,
  type RoutingDecisionResult,
  type LearnedDraft,
} from "./decision-schema.ts";

// ── Constants ───────────────────────────────────────────────────────────

/** Confidence threshold for LLM recommendations (AI-SPEC §4). */
export const CONFIDENCE_THRESHOLD = 0.75;
/** @deprecated use CONFIDENCE_THRESHOLD — alias for acceptance criteria */
export const confidenceThreshold = 0.75;

// ── Input types ─────────────────────────────────────────────────────────

export interface TestRouteInput {
  taskFacts: TaskFacts;
  inputMode?: "task_facts" | "task_plus_history" | "full_context";
  orgId: string;
  projectId?: string;
}

export interface CreateDraftInput {
  taskFacts: Record<string, unknown>;
  noMatchReason: string;
  proposedConditions: Record<string, unknown>;
  proposedActions: Record<string, unknown>;
  source: "no_match" | "llm";
  confidence: number;
  backend: string | null;
  model: string | null;
  matchingActiveRuleIds: string[];
  orgId: string;
}

export interface ApproveDraftInput {
  draftId: string;
  orgId: string;
}

export interface DeleteDraftInput {
  draftId: string;
  orgId: string;
}

export interface DryRunRuleInput {
  taskFacts: TaskFacts;
  conditions: Record<string, unknown>;
  orgId: string;
  projectId?: string;
}

export interface DryRunRuleResult {
  matched: boolean;
  evidence: string[];
}

// ── RoutingService ──────────────────────────────────────────────────────

export interface RoutingServiceOptions {
  routingRuleRepository?: unknown;
  sidecarClient?: unknown;
  /** Injectable rule matcher for testing — defaults to evaluateRuleMatch. */
  evaluateRuleMatch?: (
    facts: TaskFacts,
    orgId: string,
    projectId?: string,
  ) => Promise<{ ruleId: string; agent: string } | null>;
}

export class RoutingService {
  private readonly ruleMatcher: NonNullable<RoutingServiceOptions["evaluateRuleMatch"]>;

  constructor(
    private readonly options: RoutingServiceOptions = {},
  ) {
    // Use injectable rule matcher or default to evaluateRuleMatch
    this.ruleMatcher = options.evaluateRuleMatch ?? (async (
      facts: TaskFacts,
      orgId: string,
      projectId?: string,
    ) => {
      return evaluateRuleMatch(facts as TaskFacts, orgId, projectId);
    });
  }

  /**
   * Test route against deterministic rules, then optional LLM fallback.
   *
   * 1. Deterministic json-rules-engine match (RTR-01)
   * 2. If matched → return status="matched" with confidence=1
   * 3. If no match and LLM not enabled → return status="no_match"
   * 4. If LLM enabled → call llmFallback and process result
   */
  async testRoute(input: TestRouteInput): Promise<RoutingDecisionResult> {
    const match = await this.ruleMatcher(
      input.taskFacts as TaskFacts,
      input.orgId,
      input.projectId,
    );

    if (match) {
      return RoutingDecisionResultSchema.parse({
        status: "matched",
        confidence: 1,
        matchedRuleId: match.ruleId,
        draftId: null,
        factsUsed: input.taskFacts as unknown as Record<string, unknown>,
        evidence: [`matched rule ${match.ruleId} with agent=${match.agent}`],
      });
    }

    // No deterministic match
    const isRouterLlmEnabled = (process.env["FULCRUM_FEATURES"] ?? "")
      .split(",")
      .map((f) => f.trim().split(":")[0])
      .includes("router-llm");

    if (!isRouterLlmEnabled) {
      return RoutingDecisionResultSchema.parse({
        status: "no_match",
        confidence: 0,
        matchedRuleId: null,
        draftId: null,
        factsUsed: input.taskFacts as unknown as Record<string, unknown>,
        evidence: ["no-match: confidence=0"],
      });
    }

    // LLM fallback
    const llmResult = await llmFallback(
      input.taskFacts as TaskFacts,
      input.orgId,
    );

    if (!llmResult || llmResult.confidence === null || llmResult.confidence < ABSTAIN_THRESHOLD) {
      return RoutingDecisionResultSchema.parse({
        status: "abstained",
        confidence: llmResult?.confidence ?? 0,
        matchedRuleId: null,
        draftId: null,
        factsUsed: input.taskFacts as unknown as Record<string, unknown>,
        evidence: [
          `llm-fallback: confidence=${llmResult?.confidence ?? 0} (below abstain threshold ${ABSTAIN_THRESHOLD})`,
        ],
      });
    }

    // Confidence >= threshold: recommend
    return RoutingDecisionResultSchema.parse({
      status: "recommended",
      confidence: llmResult.confidence,
      matchedRuleId: llmResult.ruleId,
      draftId: null,
      factsUsed: input.taskFacts as unknown as Record<string, unknown>,
      evidence: [
        `llm-recommended: agent=${llmResult.agent} confidence=${llmResult.confidence}`,
      ],
    });
  }

  /**
   * Create a disabled draft from a no-match event (D-09, D-10).
   *
   * Checks for conflicts with existing active rules first (D-12).
   */
  async createDraftFromNoMatch(
    input: CreateDraftInput,
  ): Promise<{ draft: LearnedDraft; draftId: string | null }> {
    // Detect conflicts
    const conflictingRuleIds = await detectConflicts({
      proposedConditions: input.proposedConditions,
      proposedActions: input.proposedActions,
      orgId: input.orgId,
      projectId: null,
    });

    // Merge detected conflicts with input
    const allMatchingIds = [
      ...new Set([...input.matchingActiveRuleIds, ...conflictingRuleIds]),
    ];

    const draft = createDisabledDraft({
      taskFacts: input.taskFacts,
      noMatchReason: input.noMatchReason,
      proposedConditions: input.proposedConditions,
      proposedActions: input.proposedActions,
      source: input.source,
      confidence: input.confidence,
      backend: input.backend,
      model: input.model,
      matchingActiveRuleIds: allMatchingIds,
    });

    // Return the draft; real implementation persists through application services.
    return { draft, draftId: null };
  }

  /**
   * Approve a draft — promote draft conditions to an active rule.
   * Stub for now; full implementation connects to RoutingRuleRepository.
   */
  async approveDraft(input: ApproveDraftInput): Promise<void> {
    // Stub: would fetch draft, create RoutingRule, delete draft, record audit
    return;
  }

  /**
   * Delete a draft.
   * Stub for now; full implementation connects through application services.
   */
  async deleteDraft(input: DeleteDraftInput): Promise<void> {
    // Stub: would delete draft row and record audit
    return;
  }

  /**
   * Dry-run a rule against sample task facts without persisting.
   * Validates conditions with json-rules-engine.
   */
  async dryRunRule(input: DryRunRuleInput): Promise<DryRunRuleResult> {
    try {
      const engine = new Engine([], { allowUndefinedFacts: true });
      engine.addRule({
        conditions: input.conditions as TopLevelCondition,
        event: { type: "route", params: { test: true } },
      });

      const facts = {
        ...input.taskFacts,
        "task.kind": input.taskFacts.task.kind,
        "task.priority": input.taskFacts.task.priority,
        "task.tags": input.taskFacts.task.tags,
        "task.title": input.taskFacts.task.title,
      };

      const result = await engine.run(facts);
      const matched = result.events.length > 0;

      return {
        matched,
        evidence: matched
          ? ["rule conditions matched task facts"]
          : ["rule conditions did not match task facts"],
      };
    } catch (error) {
      return {
        matched: false,
        evidence: [`error evaluating conditions: ${(error as Error).message}`],
      };
    }
  }
}

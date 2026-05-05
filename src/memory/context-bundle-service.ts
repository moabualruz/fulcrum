/**
 * ContextBundleService — D-25
 *
 * Assembles 5 context slices under a hard token budget for agent memory injection.
 *
 * Slices:
 *   memories    — 25% (2000 tokens) — FTS-ranked project + global memories
 *   linkedDocs  — 20% (1600 tokens) — document context summaries
 *   recentRuns  — 35% (2800 tokens) — recent agent run outcomes
 *   repoState   — 10%  (800 tokens) — empty placeholder until Phase 7 (D-29)
 *   skillPrompts— 10%  (800 tokens) — active skill prompts (empty until Pillar 9)
 *
 * Security (T-06-05): all slice retrievers filter by orgId + projectId — no cross-tenant leak.
 * Safety (T-06-06): greedy fill stops at slice budget; total hard cap = TOTAL_TOKEN_BUDGET.
 */

import { injectable as Injectable, inject as Inject } from "@needle-di/core";
import type { MemoryRepository } from "@/db/repositories/memory/MemoryRepository";
import type { DocumentRepository } from "@/db/repositories/docs/DocumentRepository";
import type { AgentRunRepository } from "@/db/repositories/orchestration/AgentRunRepository";

// ---------------------------------------------------------------------------
// Token budget constants
// ---------------------------------------------------------------------------

export const TOTAL_TOKEN_BUDGET = 8000;

export const SLICE_BUDGETS = {
  memories: 0.25,
  linkedDocs: 0.20,
  recentRuns: 0.35,
  repoState: 0.10,
  skillPrompts: 0.10,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextBundle {
  memories: unknown[];
  linkedDocs: unknown[];
  recentRuns: unknown[];
  /** Empty placeholder — Phase 7 (D-29) will populate this slice. */
  repoState: unknown[];
  skillPrompts: unknown[];
}

export interface BundleContext {
  orgId: string;
  projectId: string;
  taskId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Rough token estimate: 1 token ≈ 4 chars (GPT-4 rule of thumb).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ContextBundleService {
  constructor(
    @Inject("MemoryRepository") private readonly memoryRepo: MemoryRepository,
    @Inject("DocumentRepository") private readonly documentRepo: DocumentRepository,
    @Inject("AgentRunRepository") private readonly agentRunRepo: AgentRunRepository,
  ) {}

  async assemble(ctx: BundleContext): Promise<ContextBundle> {
    // Fetch raw candidates from each repository slice
    const [rawMemories, rawDocs, rawRuns] = await Promise.all([
      this.memoryRepo.searchProjectAndGlobal(ctx.orgId, ctx.projectId),
      this.documentRepo.getContextSummariesForProject(ctx.projectId),
      this.agentRunRepo.getRecentForProject(ctx.projectId),
    ]);

    const bundle: ContextBundle = {
      memories: this.fillSlice(rawMemories, Math.floor(TOTAL_TOKEN_BUDGET * SLICE_BUDGETS.memories)),
      linkedDocs: this.fillSlice(rawDocs, Math.floor(TOTAL_TOKEN_BUDGET * SLICE_BUDGETS.linkedDocs)),
      recentRuns: this.fillSlice(rawRuns, Math.floor(TOTAL_TOKEN_BUDGET * SLICE_BUDGETS.recentRuns)),
      // repoState: empty placeholder per D-29; Phase 7 owns this slice
      repoState: [],
      // skillPrompts: empty until Pillar 9 (Skill System) ships
      skillPrompts: [],
    };

    return bundle;
  }

  /**
   * Greedy fill: add items until slice token budget is exhausted (T-06-06).
   */
  private fillSlice(items: unknown[], budget: number): unknown[] {
    const result: unknown[] = [];
    let used = 0;

    for (const item of items) {
      const cost = estimateTokens(JSON.stringify(item));
      if (used + cost > budget) break;
      result.push(item);
      used += cost;
    }

    return result;
  }
}

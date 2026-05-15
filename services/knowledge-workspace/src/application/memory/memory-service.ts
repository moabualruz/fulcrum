/**
 * MemoryService.
 *
 * Provides CRUD + FTS search with project>global ranking and promotion.
 *
 * Project-scoped memories rank above global for same-project queries.
 * promote() sets global=true and preserves original projectId for audit trail.
 * All queries are org-scoped, and promotion is guarded by org ownership.
 */

import { Injectable } from "@nestjs/common";
import type { Memory } from "@platform-core/infrastructure/application-database/entities/memory/Memory.ts";
import { MemoryRepository } from "@platform-core/infrastructure/application-database/repositories/memory/MemoryRepository.ts";
import type { MemoryImportance, MemoryKind, MemorySource } from "@platform-core/infrastructure/application-database/entities/memory/enums.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryRow = Memory;

export interface CreateMemoryInput {
  body: string;
  projectId?: string | null;
  importance?: MemoryImportance;
  kind?: MemoryKind;
  source?: MemorySource;
  tags?: string[];
  sourceRef?: Record<string, unknown>;
}

// Importance multipliers for deterministic tiered ranking.
const IMPORTANCE_WEIGHT: Record<MemoryImportance, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class MemoryService {
  constructor(
    private readonly repo: MemoryRepository,
  ) {}

  /**
   * FTS search returning project-scoped results ranked above global results.
   * Within each tier, importance weighting: high=3x, medium=2x, low=1x.
   */
  async search(orgId: string, term: string, projectId: string): Promise<MemoryRow[]> {
    const memories = await this.repo.searchProjectAndGlobal({
      orgId,
      projectId,
      query: term,
      topK: 100,
      includeArchived: false,
      kinds: undefined,
    });

    // Apply project>global tier + importance weighting sort
    return memories.slice().sort((a, b) => {
      // Tier: project-scoped (1) above global (0)
      const aTier = a.projectId === projectId ? 1 : 0;
      const bTier = b.projectId === projectId ? 1 : 0;
      if (bTier !== aTier) return bTier - aTier;

      // Within tier: importance weight
      const aWeight = IMPORTANCE_WEIGHT[a.importance] ?? 1;
      const bWeight = IMPORTANCE_WEIGHT[b.importance] ?? 1;
      return bWeight - aWeight;
    });
  }

  /**
   * Promote a memory to global scope.
   * Sets global=true and preserves projectId for audit trail.
   * orgId guard ensures only org members can promote.
   */
  async promote(memoryId: string, orgId: string): Promise<void> {
    const em = this.repo.getEntityManager();
    // nativeUpdate: patch only global=true; projectId intentionally NOT cleared
    await em.nativeUpdate(
      // Entity class reference — use the Memory entity constructor name
      "Memory" as never,
      { id: memoryId, orgId },
      { global: true },
    );
  }

  /**
   * List memories for a project (project-scoped + global).
   * orgId filter ensures no cross-tenant leak.
   */
  async list(orgId: string, projectId: string): Promise<MemoryRow[]> {
    return this.repo.searchProjectAndGlobal(orgId, projectId);
  }

  /**
   * Get a single memory by ID (org-scoped).
   */
  async get(orgId: string, id: string): Promise<MemoryRow | null> {
    return this.repo.findOne({ id, orgId } as never);
  }

  /**
   * Create a new memory.
   */
  async create(orgId: string, data: CreateMemoryInput): Promise<MemoryRow> {
    const em = this.repo.getEntityManager();
    const memory = this.repo.create({
      orgId,
      body: data.body,
      projectId: data.projectId ?? null,
      importance: data.importance ?? "medium",
      kind: data.kind ?? "note",
      source: data.source ?? "manual",
      tags: data.tags ?? [],
      sourceRef: data.sourceRef ?? {},
    } as never);
    if ("persistAndFlush" in em && typeof em.persistAndFlush === "function") {
      await em.persistAndFlush(memory as never);
      return memory;
    }
    em.persist(memory as never);
    await em.flush();
    return memory;
  }

  /**
   * Delete a memory by ID (org-scoped for safety).
   */
  async delete(orgId: string, id: string): Promise<void> {
    const em = this.repo.getEntityManager();
    await em.nativeUpdate(
      "Memory" as never,
      { id, orgId },
      { archived: true },
    );
  }
}

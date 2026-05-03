import { inject, injectable as Injectable } from "@needle-di/core";
import { z } from "zod";

import type { Memory } from "../db/entities/memory/Memory.ts";
import { MEMORY_KINDS } from "../db/entities/memory/enums.ts";
import { MemoryRepository } from "../db/repositories/memory/MemoryRepository.ts";
import { FlagRegistry } from "../flags/registry.ts";
import { embedQuerySafe } from "./retrieval/sidecar.ts";
import { rankMemoryMatchesHybrid } from "./retrieval/scoring.ts";
import {
  rankMemoryMatches,
  type MemoryRankInput,
} from "./retrieval/scoring.ts";

const UuidLikeSchema = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
);

export const RetrieverOptsSchema = z.object({
  orgId: UuidLikeSchema,
  projectId: UuidLikeSchema.nullable().default(null),
  query: z.string().default(""),
  topK: z.number().int().min(1).max(100).default(20),
  includeArchived: z.boolean().default(false),
  kinds: z.array(z.enum(MEMORY_KINDS)).min(1).optional(),
}).strict();

export type RetrieverOpts = z.input<typeof RetrieverOptsSchema>;
export type NormalizedRetrieverOpts = z.output<typeof RetrieverOptsSchema>;

export interface RetrieveResult {
  memories: Memory[];
  /** Query embedding when hybrid path used; cached in context_snapshots.bundle_blob for replay. */
  queryEmbedding: number[] | null;
}

@Injectable()
export class MemoryRetriever {
  constructor(
    private readonly memoryRepo = inject(MemoryRepository),
    private readonly flagRegistry?: FlagRegistry,
  ) {}

  async retrieve(query: string, opts: RetrieverOpts): Promise<Memory[]> {
    const result = await this.retrieveWithMeta(query, opts);
    return result.memories;
  }

  /**
   * Retrieve with metadata — returns query embedding for caching in
   * context_snapshots.bundle_blob (replay hydration without re-embedding).
   */
  async retrieveWithMeta(query: string, opts: RetrieverOpts): Promise<RetrieveResult> {
    const input = RetrieverOptsSchema.parse({ ...opts, query });

    // Check embeddings flag
    const embeddingsEnabled = await this._isEmbeddingsEnabled(input.orgId);

    if (embeddingsEnabled && input.query.trim() !== "") {
      const queryEmbedding = await embedQuerySafe(input.query);

      if (queryEmbedding) {
        // Hybrid path: fetch candidates, re-rank with hybrid scoring
        const candidates = await this.memoryRepo.searchProjectAndGlobal(input);
        const hybridInputs = candidates
          .filter((m) => m.embedding != null)
          .map((m) => ({
            ...toRankInput(m),
            embedding: m.embedding!,
            _entity: m,
          }));

        // Memories without embeddings get FTS-only scoring
        const noEmbedding = candidates.filter((m) => m.embedding == null);

        if (hybridInputs.length > 0) {
          const hybridRanked = rankMemoryMatchesHybrid(
            input.query,
            hybridInputs,
            queryEmbedding,
            { topK: input.topK },
          );

          // Merge: hybrid-scored first, then non-embedded by original order
          const hybridIds = new Set(hybridRanked.map((r) => r.memory.id));
          const merged = [
            ...hybridRanked.map((r) => r.memory._entity),
            ...noEmbedding.filter((m) => !hybridIds.has(m.id)),
          ].slice(0, input.topK);

          return { memories: merged, queryEmbedding };
        }

        // All candidates lack embeddings — fall through to FTS-only
        return { memories: candidates, queryEmbedding };
      }

      // Sidecar unavailable — warning already logged by embedQuerySafe
    }

    // FTS-only path (flag OFF or sidecar unavailable or empty query)
    const memories = await this.memoryRepo.searchProjectAndGlobal(input);
    return { memories, queryEmbedding: null };
  }

  private async _isEmbeddingsEnabled(orgId: string): Promise<boolean> {
    if (!this.flagRegistry) {
      // Fallback: check env var directly
      const envFlags = (process.env["FULCRUM_FEATURES"] ?? "")
        .split(",")
        .map((f) => f.trim());
      return envFlags.includes("embeddings");
    }
    return this.flagRegistry.isEnabled("embeddings", { orgId });
  }
}

function toRankInput(m: Memory): MemoryRankInput {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    importance: m.importance,
  };
}

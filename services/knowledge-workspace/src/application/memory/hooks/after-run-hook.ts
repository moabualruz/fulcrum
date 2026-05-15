import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Memory } from "@knowledge-workspace/infrastructure/database/entities/memory/Memory.ts";
import { MemoryLink } from "@knowledge-workspace/infrastructure/database/entities/memory/MemoryLink.ts";
import { HeuristicExtractor, type HeuristicMemory } from "../extractor-heuristic.ts";

export interface AfterRunMemoryContext {
  orgId: string | null | undefined;
}

@Injectable()
export class AfterRunMemoryHook {
  constructor(
    private readonly em: EntityManager,
    private readonly extractor: HeuristicExtractor,
  ) {}

  async handle(runId: string, transcript: string, ctx: AfterRunMemoryContext): Promise<void> {
    const orgId = ctx.orgId;
    if (!orgId) {
      throw new Error("AfterRunMemoryHook requires ctx.orgId");
    }

    const candidates = this.extractor.extractMemories(transcript);
    if (candidates.length === 0) return;

    const em = this.em as EntityManager;
    const orgRef = { id: orgId } as Org;
    const now = new Date();

    for (const candidate of candidates) {
      const sourceRef = sourceRefFor(runId, candidate);
      let memory = await em.findOne(Memory, { where: {
        org: orgId,
        kind: candidate.kind,
        body: candidate.body,
        source: "heuristic",
      } as never });

      if (!memory) {
        memory = em.create(Memory, {
          org: orgRef,
          projectId: null,
          kind: candidate.kind,
          body: candidate.body,
          source: "heuristic" as const,
          importance: candidate.importance,
          tags: [],
          global: false,
          archived: false,
          sourceRef,
          createdAt: now,
          updatedAt: now,
        });
        await em.save(memory);
      }

      const existingLink = await em.findOne(MemoryLink, { where: {
        memory: memory.id,
        targetKind: "agent_run",
        targetId: runId,
      } as never });

      if (!existingLink) {
        const link = em.create(MemoryLink, {
          org: orgRef,
          memory,
          targetKind: "agent_run" as const,
          targetId: runId,
        });
        await em.save(link);
      }
    }
  }
}

function sourceRefFor(
  runId: string,
  candidate: HeuristicMemory,
): Record<string, unknown> {
  return {
    run_id: runId,
    ...candidate.sourceRef,
  };
}

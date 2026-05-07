import { inject, injectable as Injectable } from "@needle-di/core";
import type { EntityManager } from "@mikro-orm/postgresql";

import { ENTITY_MANAGER_TOKEN } from "../../db/db.module.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { Memory } from "../../db/entities/memory/Memory.ts";
import { MemoryLink } from "../../db/entities/memory/MemoryLink.ts";
import type { TRPCContext } from "@fulcrum/server/trpc/context.ts";
import { HeuristicExtractor, type HeuristicMemory } from "../extractor-heuristic.ts";

@Injectable()
export class AfterRunMemoryHook {
  constructor(
    private readonly em = inject(ENTITY_MANAGER_TOKEN),
    private readonly extractor = inject(HeuristicExtractor),
  ) {}

  async handle(runId: string, transcript: string, ctx: TRPCContext): Promise<void> {
    const orgId = ctx.orgId;
    if (!orgId) {
      throw new Error("AfterRunMemoryHook requires ctx.orgId");
    }

    const candidates = this.extractor.extractMemories(transcript);
    if (candidates.length === 0) return;

    const em = this.em as EntityManager;
    const orgRef = em.getReference(Org, orgId);
    const now = new Date();

    for (const candidate of candidates) {
      const sourceRef = sourceRefFor(runId, candidate);
      let memory = await em.findOne(Memory, {
        org: orgId,
        kind: candidate.kind,
        body: candidate.body,
        source: "heuristic",
      } as never);

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
        em.persist(memory);
        await em.flush();
      }

      const existingLink = await em.findOne(MemoryLink, {
        memory: memory.id,
        targetKind: "agent_run",
        targetId: runId,
      } as never);

      if (!existingLink) {
        const link = em.create(MemoryLink, {
          org: orgRef,
          memory,
          targetKind: "agent_run" as const,
          targetId: runId,
        });
        em.persist(link);
        await em.flush();
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

/**
 * AgentRunRepository — orchestration domain (Pillar 3).
 *
 * Stub repository — Pillar 3 fills in domain methods.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<AgentRun>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { AgentRun } from "../../entities/orchestration/AgentRun.ts";

@injectable()
export class AgentRunRepository extends EntityRepository<AgentRun> {
  /**
   * Fetch recent agent runs for a project — used by ContextBundleService slice 3 (D-25).
   * Returns runs ordered by createdAt DESC.
   * Stub: full filtering added when Pillar 3 domain logic lands.
   */
  async getRecentForProject(projectId: string, limit = 20): Promise<AgentRun[]> {
    return this.find(
      { projectId } as never,
      { orderBy: { createdAt: "DESC" } as never, limit },
    );
  }
}

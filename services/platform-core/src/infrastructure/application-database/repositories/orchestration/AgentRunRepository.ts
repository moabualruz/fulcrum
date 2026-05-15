/**
 * AgentRunRepository — orchestration domain (Pillar 3).
 *
 * Stub repository — Pillar 3 fills in domain methods.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AgentRun } from "../../entities/orchestration/AgentRun.ts";

@Injectable()
export class AgentRunRepository {
  constructor(
    @InjectRepository(AgentRun)
    private readonly agentRuns: Repository<AgentRun>,
  ) {}

  /**
   * Fetch recent agent runs for a project — used by ContextBundleService slice 3 (D-25).
   * Returns runs ordered by createdAt DESC.
   * Stub: full filtering added when Pillar 3 domain logic lands.
   */
  async getRecentForProject(_projectId: string, limit = 20): Promise<AgentRun[]> {
    // AgentRun has no projectId column; returns most recent runs across all projects.
    // Pillar 3 will add project-scoped filtering when domain logic lands.
    return this.agentRuns.find({
      order: { createdAt: "DESC" },
      take: limit,
    });
  }
}

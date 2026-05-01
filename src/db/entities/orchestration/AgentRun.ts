/**
 * AgentRun entity — orchestration domain (Pillar 3 stub).
 *
 * Stub: only the columns required for the FK + composite index land here.
 * Pillar 3 (Orchestration / agent execution) will ADD additional columns
 * (agent, status, model, tokens, finishedAt, error, …) via its own migration.
 *
 * C2: Composite (org_id, started_at desc) index from day 1 — recent runs.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires AgentRunRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { AgentRunRepository } from "../../repositories/orchestration/AgentRunRepository.ts";

@Entity({ tableName: "agent_runs", repository: () => AgentRunRepository })
@Index({
  name: "idx_agent_runs_org_started",
  properties: ["org", "startedAt"],
})
export class AgentRun {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @Property({ type: "datetime", fieldName: "started_at", defaultRaw: "now()" })
  startedAt!: Date;
}

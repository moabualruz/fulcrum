/**
 * ExperimentAssignment entity — platform domain (Pillar 17 cross-cutting).
 *
 * Per-(org, user, experiment) deterministic variant assignment. Bucketing:
 *   sha256(user_id + experiment_id) % 100 < FeatureFlagRollout.rolloutPercent.
 *
 * Q22: (org, experiment_id) composite — variant aggregate query.
 * UNIQUE (org, user, experiment_id) — one variant per user per experiment.
 * C2: org_id + user_id NOT NULL with cascade.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires ExperimentAssignmentRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
  Unique,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { User } from "../auth/User.ts";
import { ExperimentAssignmentRepository } from "../../repositories/platform/ExperimentAssignmentRepository.ts";

@Entity({
  tableName: "experiment_assignment",
  repository: () => ExperimentAssignmentRepository,
})
@Unique({
  name: "uq_experiment_assignment_org_user_experiment",
  properties: ["org", "user", "experimentId"],
})
@Index({
  name: "idx_experiment_assignment_org_experiment",
  properties: ["org", "experimentId"],
})
export class ExperimentAssignment {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @ManyToOne(() => User, {
    fieldName: "user_id",
    nullable: false,
    deleteRule: "cascade",
  })
  user!: User;

  /** Experiment identifier — e.g. "kanban-density-v2". */
  @Property({ type: "string", fieldName: "experiment_id" })
  experimentId!: string;

  /** Variant chosen from FeatureFlagRollout.cohortRules.variants. */
  @Property({ type: "string" })
  variant!: string;

  @Property({ type: "datetime", fieldName: "assigned_at", defaultRaw: "now()" })
  assignedAt!: Date;
}

/**
 * ExperimentAssignment entity — platform domain (Pillar 17 cross-cutting).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  Unique,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";

@Entity("experiment_assignment")
@Unique("uq_experiment_assignment_org_user_experiment", ["org", "user", "experimentId"])
@Index("idx_experiment_assignment_org_experiment", ["org", "experimentId"])
export class ExperimentAssignment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "varchar", name: "experiment_id" })
  experimentId!: string;

  @Column({ type: "varchar" })
  variant!: string;

  @Column({ type: "timestamptz", name: "assigned_at", default: () => "now()" })
  assignedAt!: Date;
}

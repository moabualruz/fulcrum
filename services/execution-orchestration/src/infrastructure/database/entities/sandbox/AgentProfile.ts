/**
 * AgentProfile entity — persisted Sandcastle agent profile registry (P4#04).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("agent_profiles")
@Unique("agent_profiles_org_name", ["org", "name"])
export class AgentProfile {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar", name: "cli_path", nullable: true })
  cliPath?: string;

  @Column({ type: "varchar", name: "skill_folder", nullable: true })
  skillFolder?: string;

  @Column({ type: "simple-array", name: "default_flags", nullable: true })
  defaultFlags?: string[];

  @Column({ type: "simple-array", name: "auth_env_vars", nullable: true })
  authEnvVars?: string[];

  @Column({ type: "integer", name: "max_iterations", default: 10 })
  maxIterations: number = 10;

  @Column({ type: "integer", name: "default_timeout", default: 600000 })
  defaultTimeout: number = 600000;

  @Column({ type: "timestamptz", name: "last_tested_at", nullable: true })
  lastTestedAt?: Date;

  @Column({ type: "boolean", name: "test_passed", nullable: true })
  testPassed?: boolean;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}

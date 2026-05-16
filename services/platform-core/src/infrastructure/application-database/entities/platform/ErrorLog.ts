/**
 * ErrorLog entity — platform domain (Pillar 17 cross-cutting).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";

@Entity("error_logs")
@Index() // expression: CREATE INDEX "idx_error_logs_org_occurred" ON "error_logs" ("org_id", "occurred_at" DESC)
export class ErrorLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ type: "timestamptz", name: "occurred_at", default: () => "now()" })
  occurredAt!: Date;

  @Column({ type: "varchar", nullable: true })
  environment?: string;

  @Column({ type: "varchar", name: "app_version", nullable: true })
  appVersion?: string;

  @Column({ type: "varchar", name: "recent_route", nullable: true })
  recentRoute?: string;

  @Column({ type: "varchar", name: "recent_trpc_procedure", nullable: true })
  recentTrpcProcedure?: string;

  @Column({ type: "text", name: "error_message" })
  errorMessage!: string;

  @Column({ type: "text", name: "stack_trace", nullable: true })
  stackTrace?: string;

  @Column({ type: "jsonb" })
  context: Record<string, unknown> = {};
}

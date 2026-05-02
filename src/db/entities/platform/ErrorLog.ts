/**
 * ErrorLog entity — platform domain (Pillar 17 cross-cutting).
 *
 * Mirror of `~/.fulcrum/state/errors/YYYY-MM-DD.jsonl` for tRPC `errors.list/get`
 * surfaces. Rows always written for unhandled exceptions and unhandled promise
 * rejections (always-on local crashlog). Remote outbound reporting gated behind
 * `FULCRUM_FEATURES=error-reporting-remote`.
 *
 * Q22: (org, occurred_at DESC) composite — newest-first crash listing.
 * C2: org_id NOT NULL cascade; user_id nullable set-null.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires ErrorLogRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { User } from "../auth/User.ts";
import { ErrorLogRepository } from "../../repositories/platform/ErrorLogRepository.ts";

@Entity({ tableName: "error_logs", repository: () => ErrorLogRepository })
@Index({
  name: "idx_error_logs_org_occurred",
  expression:
    'CREATE INDEX "idx_error_logs_org_occurred" ON "error_logs" ("org_id", "occurred_at" DESC)',
})
export class ErrorLog {
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
    nullable: true,
    deleteRule: "set null",
  })
  user?: User;

  @Property({ type: "datetime", fieldName: "occurred_at", defaultRaw: "now()" })
  occurredAt!: Date;

  @Property({ type: "string", nullable: true })
  os?: string;

  @Property({ type: "string", nullable: true })
  arch?: string;

  @Property({ type: "string", fieldName: "bun_version", nullable: true })
  bunVersion?: string;

  @Property({ type: "string", fieldName: "fulcrum_version", nullable: true })
  fulcrumVersion?: string;

  @Property({
    type: "text",
    fieldName: "recent_cli_command",
    nullable: true,
  })
  recentCliCommand?: string;

  @Property({
    type: "string",
    fieldName: "recent_trpc_procedure",
    nullable: true,
  })
  recentTrpcProcedure?: string;

  @Property({ type: "text", fieldName: "error_message" })
  errorMessage!: string;

  @Property({ type: "text", fieldName: "stack_trace", nullable: true })
  stackTrace?: string;

  /** Free-form contextual metadata; absolute paths scrubbed before insert. */
  @Property({ type: "json" })
  context: Record<string, unknown> = {};
}

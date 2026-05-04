/**
 * Verification entity — auth domain (email OTP / magic-link tokens).
 *
 * Better-Auth "verification" model: stores short-lived tokens for email
 * verification, magic-link login, and email OTP flows.
 * Always present as a table even when saas-auth flag is OFF (C1: wire now,
 * gate later).
 *
 * C1: Table exists always; writes gated by saas-auth feature flag at runtime.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 *     Stage-3 decorators do NOT emit reflect-metadata type info — explicit `type`
 *     is required on every @Property/@PrimaryKey decorator.
 * C8: @Entity({ repository }) wires VerificationRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  Index,
  Unique,
  ManyToOne,
} from "@mikro-orm/decorators/es";
import { VerificationRepository } from "../../repositories/auth/VerificationRepository.ts";
import { Org } from "./Org.ts";

@Entity({ tableName: "verifications", repository: () => VerificationRepository })
@Unique({ name: "uq_verifications_identifier_value", properties: ["identifier", "value"] })
@Index({ name: "idx_verifications_org_identifier", properties: ["org", "identifier"] })
@Index({ name: "idx_verifications_identifier", properties: ["identifier"] })
@Index({ name: "idx_verifications_expires_at", properties: ["expiresAt"] })
export class Verification {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: true,
    deleteRule: "cascade",
  })
  org: Org | null = null;

  /**
   * The identifier this token is scoped to (e.g. email address, user ID).
   * Better-Auth queries by identifier to look up pending tokens.
   */
  @Property({ type: "string" })
  identifier!: string;

  /**
   * The opaque token value (OTP code, magic-link token, etc.).
   */
  @Property({ type: "text" })
  value!: string;

  /** When this token expires. Better-Auth enforces this at query time. */
  @Property({ type: "datetime", fieldName: "expires_at" })
  expiresAt!: Date;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}

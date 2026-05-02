/**
 * Account entity — auth domain (OAuth provider accounts).
 *
 * Better-Auth "account" model: links a User to an OAuth provider credential.
 * Always present as a table even when saas-auth flag is OFF (C1: wire now,
 * gate later). Non-gated auth (email/password) does not write to this table.
 *
 * C1: Table exists always; writes gated by saas-auth feature flag at runtime.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 *     Stage-3 decorators do NOT emit reflect-metadata type info — explicit `type`
 *     is required on every @Property/@PrimaryKey decorator.
 * C8: @Entity({ repository }) wires AccountRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  Index,
  ManyToOne,
} from "@mikro-orm/decorators/es";
import { AccountRepository } from "../../repositories/auth/AccountRepository.ts";
import { Org } from "./Org.ts";

@Entity({ tableName: "accounts", repository: () => AccountRepository })
@Index({ name: "idx_accounts_org_user", properties: ["org", "userId"] })
@Index({ name: "idx_accounts_user_id", properties: ["userId"] })
@Index({ name: "idx_accounts_provider", properties: ["providerId", "accountId"] })
export class Account {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: true,
    deleteRule: "cascade",
  })
  org: Org | null = null;

  /**
   * References users.id — not a FK constraint to keep cascade behaviour
   * simple across all Better-Auth models; Better-Auth manages the join itself.
   */
  @Property({ type: "uuid", fieldName: "user_id" })
  userId!: string;

  /** OAuth provider identifier, e.g. "google", "github". */
  @Property({ type: "string", fieldName: "provider_id" })
  providerId!: string;

  /** Provider-specific account/subject ID. */
  @Property({ type: "string", fieldName: "account_id" })
  accountId!: string;

  /** Short-lived access token (nullable — not always returned). */
  @Property({ type: "text", fieldName: "access_token", nullable: true })
  accessToken?: string;

  /** Refresh token for long-lived sessions. */
  @Property({ type: "text", fieldName: "refresh_token", nullable: true })
  refreshToken?: string;

  /** Expiry of the access token. */
  @Property({ type: "datetime", fieldName: "access_token_expires_at", nullable: true })
  accessTokenExpiresAt?: Date;

  /** Expiry of the refresh token. */
  @Property({ type: "datetime", fieldName: "refresh_token_expires_at", nullable: true })
  refreshTokenExpiresAt?: Date;

  /** Raw provider token scope string. */
  @Property({ type: "string", nullable: true })
  scope?: string;

  /** OIDC id_token, if returned by provider. */
  @Property({ type: "text", fieldName: "id_token", nullable: true })
  idToken?: string;

  /** Provider-specific password hash (for credential accounts, e.g., email/password stored via account). */
  @Property({ type: "text", nullable: true })
  password?: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}

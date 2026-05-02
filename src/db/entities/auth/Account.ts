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
  Unique,
} from "@mikro-orm/decorators/es";
import { Type, type EntityProperty, type Platform } from "@mikro-orm/core";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { AccountRepository } from "../../repositories/auth/AccountRepository.ts";
import { Org } from "./Org.ts";

const ENCRYPTED_TOKEN_PREFIX = "fc1.";
const DEV_TEST_ACCOUNT_TOKEN_SECRET = "fulcrum-dev-test-account-token-secret-00000000";

class EncryptedAccountTokenType extends Type<string | null | undefined, string | null> {
  override convertToDatabaseValue(value: string | null | undefined): string | null {
    if (value == null) return null;
    if (value.startsWith(ENCRYPTED_TOKEN_PREFIX)) return value;
    return encryptAccountToken(value);
  }

  override convertToJSValue(value: string | null | undefined): string | null {
    if (value == null) return null;
    if (!value.startsWith(ENCRYPTED_TOKEN_PREFIX)) return value;
    return decryptAccountToken(value);
  }

  override getColumnType(_prop: EntityProperty, _platform: Platform): string {
    return "text";
  }
}

function encryptAccountToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", accountTokenKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTED_TOKEN_PREFIX.slice(0, -1),
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptAccountToken(value: string): string {
  const [, ivText, tagText, ciphertextText] = value.split(".");
  if (!ivText || !tagText || !ciphertextText) {
    throw new Error("Stored account token envelope is invalid.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    accountTokenKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function accountTokenKey(): Buffer {
  const secret = nonEmptyEnv("FULCRUM_ACCOUNT_TOKEN_KEY") ??
    nonEmptyEnv("BETTER_AUTH_SECRET");
  if (!secret && process.env["NODE_ENV"] === "production") {
    throw new Error(
      "FULCRUM_ACCOUNT_TOKEN_KEY or BETTER_AUTH_SECRET is required for account token encryption.",
    );
  }
  return createHash("sha256")
    .update(secret ?? DEV_TEST_ACCOUNT_TOKEN_SECRET)
    .digest();
}

function nonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

@Entity({ tableName: "accounts", repository: () => AccountRepository })
@Index({ name: "idx_accounts_org_user", properties: ["org", "userId"] })
@Index({ name: "idx_accounts_user_id", properties: ["userId"] })
@Unique({
  name: "uq_accounts_provider_account",
  properties: ["providerId", "accountId"],
})
export class Account {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: true,
    deleteRule: "cascade",
  })
  org: Org | null = null;

  /** References users.id with ON DELETE CASCADE at the migration boundary. */
  @Property({ type: "uuid", fieldName: "user_id" })
  userId!: string;

  /** OAuth provider identifier, e.g. "google", "github". */
  @Property({ type: "string", fieldName: "provider_id" })
  providerId!: string;

  /** Provider-specific account/subject ID. */
  @Property({ type: "string", fieldName: "account_id" })
  accountId!: string;

  /** Short-lived access token (nullable — not always returned). */
  @Property({
    type: EncryptedAccountTokenType,
    fieldName: "access_token",
    nullable: true,
  })
  accessToken?: string;

  /** Refresh token for long-lived sessions. */
  @Property({
    type: EncryptedAccountTokenType,
    fieldName: "refresh_token",
    nullable: true,
  })
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
  @Property({
    type: EncryptedAccountTokenType,
    fieldName: "id_token",
    nullable: true,
  })
  idToken?: string;

  /** Provider-specific password hash (for credential accounts, e.g., email/password stored via account). */
  @Property({ type: "text", nullable: true })
  password?: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}

/**
 * Account entity — auth domain (OAuth provider accounts).
 *
 * Better-Auth "account" model: links a User to an OAuth provider credential.
 * Always present as a table even when saas-auth flag is OFF (C1: wire now,
 * gate later). Non-gated auth (email/password) does not write to this table.
 *
 * C1: Table exists always; writes gated by saas-auth feature flag at runtime.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  Unique,
  JoinColumn,
} from "typeorm";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Org } from "./Org.ts";

const ENCRYPTED_TOKEN_PREFIX = "fc1.";
const DEV_TEST_ACCOUNT_TOKEN_SECRET = "fulcrum-dev-test-account-token-secret-00000000";

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

const encryptedTokenTransformer = {
  to(value: string | null | undefined): string | null {
    if (value == null) return null;
    if (value.startsWith(ENCRYPTED_TOKEN_PREFIX)) return value;
    return encryptAccountToken(value);
  },
  from(value: string | null | undefined): string | null {
    if (value == null) return null;
    if (!value.startsWith(ENCRYPTED_TOKEN_PREFIX)) return value;
    return decryptAccountToken(value);
  },
};

@Entity("accounts")
@Index("idx_accounts_org_user", ["org", "userId"])
@Index("idx_accounts_user_id", ["userId"])
@Unique("uq_accounts_provider_account", ["providerId", "accountId"])
export class Account {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org: Org | null = null;

  /** References users.id with ON DELETE CASCADE at the migration boundary. */
  @Column({ type: "varchar", name: "user_id" })
  userId!: string;

  /** OAuth provider identifier, e.g. "google", "github". */
  @Column({ type: "varchar", name: "provider_id" })
  providerId!: string;

  /** Provider-specific account/subject ID. */
  @Column({ type: "varchar", name: "account_id" })
  accountId!: string;

  /** Short-lived access token (nullable — not always returned). */
  @Column({ type: "text", name: "access_token", nullable: true, transformer: encryptedTokenTransformer })
  accessToken?: string;

  /** Refresh token for long-lived sessions. */
  @Column({ type: "text", name: "refresh_token", nullable: true, transformer: encryptedTokenTransformer })
  refreshToken?: string;

  /** Expiry of the access token. */
  @Column({ type: "timestamptz", name: "access_token_expires_at", nullable: true })
  accessTokenExpiresAt?: Date;

  /** Expiry of the refresh token. */
  @Column({ type: "timestamptz", name: "refresh_token_expires_at", nullable: true })
  refreshTokenExpiresAt?: Date;

  /** Raw provider token scope string. */
  @Column({ type: "varchar", nullable: true })
  scope?: string;

  /** OIDC id_token, if returned by provider. */
  @Column({ type: "text", name: "id_token", nullable: true, transformer: encryptedTokenTransformer })
  idToken?: string;

  /** Provider-specific password hash (for credential accounts, e.g., email/password stored via account). */
  @Column({ type: "text", nullable: true })
  password?: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}

/**
 * Credential entity — platform domain (Pillar 17 cross-cutting).
 *
 * Per-org / per-user encrypted secret store. `encryptedValue` is XSalsa20-Poly1305
 * ciphertext (`nacl.secretbox`) keyed via system keyring → Argon2id KDF fallback
 * (Pillar 17 secrets module).
 *
 * Q22: org FK NOT NULL + composite indexes mandatory at table-creation time.
 *      Composite (org, user, last_used_at DESC) — credential-list query plan.
 *      Composite (org, archived) — active-credentials filter.
 * Q-cross-cut (B9): always-on secret management via this entity.
 * C2: org_id NOT NULL with cascade delete.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 *     `last_used_at DESC` ordering encoded via expression-form @Index since
 *     properties-form does not carry per-column direction in v7 metadata.
 * C8: @Entity({ repository }) wires CredentialRepository.
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
import { CredentialRepository } from "../../repositories/platform/CredentialRepository.ts";

@Entity({ tableName: "credentials", repository: () => CredentialRepository })
@Unique({
  name: "uq_credentials_org_user_name",
  properties: ["org", "user", "name"],
})
// DESC ordering on last_used_at preserved via expression form.
@Index({
  name: "idx_credentials_org_user_last_used",
  expression:
    'CREATE INDEX "idx_credentials_org_user_last_used" ON "credentials" ("org_id", "user_id", "last_used_at" DESC)',
})
@Index({
  name: "idx_credentials_org_archived",
  properties: ["org", "archived"],
})
export class Credential {
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

  @Property({ type: "string" })
  name!: string;

  /** XSalsa20-Poly1305 ciphertext blob; keys never persisted in this column. */
  @Property({ type: "blob", fieldName: "encrypted_value" })
  encryptedValue!: Uint8Array;

  @Property({ type: "string" })
  algo: string = "nacl-secretbox";

  @Property({ type: "string" })
  kdf: string = "argon2id";

  /**
   * Provider switch for vault-integration flag — `local` keyring, `vault`,
   * `aws-sm`, `gcp-sm`, `1password`. Default `local` always-on.
   */
  @Property({ type: "string" })
  provider: string = "local";

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "last_used_at", nullable: true })
  lastUsedAt?: Date;

  @Property({ type: "boolean" })
  archived: boolean = false;
}

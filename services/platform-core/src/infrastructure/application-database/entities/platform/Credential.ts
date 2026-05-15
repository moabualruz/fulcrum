/**
 * Credential entity — platform domain (Pillar 17 cross-cutting).
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

@Entity("credentials")
@Unique("uq_credentials_org_user_name", ["org", "user", "name"])
@Index() // expression: CREATE INDEX "idx_credentials_org_user_last_used" ON "credentials" ("org_id", "user_id", "last_used_at" DESC)
@Index("idx_credentials_org_archived", ["org", "archived"])
export class Credential {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "varchar" })
  name!: string;

  /** XSalsa20-Poly1305 ciphertext blob; keys never persisted in this column. */
  @Column({ type: "bytea", name: "encrypted_value" })
  encryptedValue!: Uint8Array;

  @Column({ type: "varchar" })
  algo: string = "nacl-secretbox";

  @Column({ type: "varchar" })
  kdf: string = "argon2id";

  @Column({ type: "varchar" })
  provider: string = "local";

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "last_used_at", nullable: true })
  lastUsedAt?: Date;

  @Column({ type: "boolean" })
  archived: boolean = false;
}

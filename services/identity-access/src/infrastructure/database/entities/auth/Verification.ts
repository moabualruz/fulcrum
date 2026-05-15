/**
 * Verification entity — auth domain (email OTP / magic-link tokens).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Org } from "./Org.ts";

@Entity("verifications")
@Unique("uq_verifications_identifier_value", ["identifier", "value"])
@Index("idx_verifications_org_identifier", ["org", "identifier"])
@Index("idx_verifications_identifier", ["identifier"])
@Index("idx_verifications_expires_at", ["expiresAt"])
export class Verification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org: Org | null = null;

  /**
   * The identifier this token is scoped to (e.g. email address, user ID).
   */
  @Column({ type: "varchar" })
  identifier!: string;

  /**
   * The opaque token value (OTP code, magic-link token, etc.).
   */
  @Column({ type: "text" })
  value!: string;

  /** When this token expires. */
  @Column({ type: "timestamptz", name: "expires_at" })
  expiresAt!: Date;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}

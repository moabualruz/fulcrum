/**
 * SkillConflict entity — structured sync/lock conflict persistence.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from "typeorm";

export enum SkillConflictKind {
  UpstreamConflict = "upstream_conflict",
  ShaMismatch = "sha_mismatch",
}

export enum SkillConflictStatus {
  Open = "open",
  Overridden = "overridden",
  Resolved = "resolved",
}

@Entity("skill_conflicts")
export class SkillConflict {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  slug!: string;

  @Column({ type: "enum", enum: SkillConflictKind })
  kind!: SkillConflictKind;

  @Column({ type: "enum", enum: SkillConflictStatus })
  status: SkillConflictStatus = SkillConflictStatus.Open;

  @Column({ name: "local_hash", nullable: true })
  localHash?: string;

  @Column({ name: "upstream_hash", nullable: true })
  upstreamHash?: string;

  @Column({ name: "base_hash", nullable: true })
  baseHash?: string;

  @Column({ name: "expected_sha256", nullable: true })
  expectedSha256?: string;

  @Column({ name: "actual_sha256", nullable: true })
  actualSha256?: string;

  @Column({ type: "text", name: "suggested_resolution", nullable: true })
  suggestedResolution?: string;

  @Column({ type: "text", name: "audit_note", nullable: true })
  auditNote?: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}

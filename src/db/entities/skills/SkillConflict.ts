/**
 * SkillConflict entity — structured sync/lock conflict persistence.
 *
 * D-21: Lock SHA mismatch uses exact expected/actual SHA fields.
 * D-22: Upstream sync creates conflicts for local edits.
 * D-23: Structured three-way conflict artifacts (not inline markers).
 * D-24: Override writes audit-ready records.
 */

import {
  Entity,
  Enum,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";

export enum SkillConflictKind {
  UpstreamConflict = "upstream_conflict",
  ShaMismatch = "sha_mismatch",
}

export enum SkillConflictStatus {
  Open = "open",
  Overridden = "overridden",
  Resolved = "resolved",
}

@Entity({ tableName: "skill_conflicts" })
export class SkillConflict {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "string" })
  slug!: string;

  @Enum({ items: () => SkillConflictKind })
  kind!: SkillConflictKind;

  @Enum({ items: () => SkillConflictStatus })
  status: SkillConflictStatus = SkillConflictStatus.Open;

  @Property({ type: "string", fieldName: "local_hash", nullable: true })
  localHash?: string;

  @Property({ type: "string", fieldName: "upstream_hash", nullable: true })
  upstreamHash?: string;

  @Property({ type: "string", fieldName: "base_hash", nullable: true })
  baseHash?: string;

  @Property({ type: "string", fieldName: "expected_sha256", nullable: true })
  expectedSha256?: string;

  @Property({ type: "string", fieldName: "actual_sha256", nullable: true })
  actualSha256?: string;

  @Property({ type: "text", fieldName: "suggested_resolution", nullable: true })
  suggestedResolution?: string;

  @Property({ type: "text", fieldName: "audit_note", nullable: true })
  auditNote?: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}

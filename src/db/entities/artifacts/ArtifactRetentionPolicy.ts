import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";
import { Project } from "../tasks/Project.ts";

export type ArtifactRetentionScopeKind = "org" | "project";
export type ArtifactRetentionArtifactKind = "project" | "scratch" | string;

@Entity({ tableName: "artifact_retention_policies" })
@Index({ name: "idx_artifact_retention_policies_org", properties: ["org"] })
@Index({ name: "idx_artifact_retention_policies_artifact_kind", properties: ["artifactKind"] })
@Unique({
  name: "uq_artifact_retention_policies_scope",
  properties: ["org", "project", "scopeKind", "artifactKind"],
})
export class ArtifactRetentionPolicy {
  [OptionalProps]?:
    | "project"
    | "scopeKind"
    | "retentionDays"
    | "keepLatestPerRef"
    | "keepPinned"
    | "enabled"
    | "notes"
    | "createdBy"
    | "createdAt"
    | "updatedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @ManyToOne(() => Project, {
    fieldName: "project_id",
    nullable: true,
    deleteRule: "cascade",
  })
  project?: Project | null;

  @Property({ type: "string", fieldName: "scope_kind", default: "project" })
  scopeKind: ArtifactRetentionScopeKind = "project";

  @Property({ type: "string", fieldName: "artifact_kind" })
  artifactKind!: ArtifactRetentionArtifactKind;

  @Property({ type: "integer", fieldName: "retention_days", nullable: true })
  retentionDays: number | null = null;

  @Property({ type: "boolean", fieldName: "keep_latest_per_ref", default: true })
  keepLatestPerRef: boolean = true;

  @Property({ type: "boolean", fieldName: "keep_pinned", default: true })
  keepPinned: boolean = true;

  @Property({ type: "boolean", default: true })
  enabled: boolean = true;

  @Property({ type: "text", nullable: true })
  notes?: string | null;

  @Property({ type: "uuid", fieldName: "created_by", nullable: true })
  createdBy?: string | null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}

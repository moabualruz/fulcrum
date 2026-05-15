import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  JoinColumn,
} from "typeorm";

import { Org } from "../auth/Org.ts";
import { Project } from "../tasks/Project.ts";

export type ArtifactRetentionScopeKind = "org" | "project";
export type ArtifactRetentionArtifactKind = "project" | "scratch" | string;

@Entity("artifact_retention_policies")
@Index("idx_artifact_retention_policies_org", ["org"])
@Index("idx_artifact_retention_policies_artifact_kind", ["artifactKind"])
@Unique("uq_artifact_retention_policies_scope", ["org", "project", "scopeKind", "artifactKind"])
export class ArtifactRetentionPolicy {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => Project, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project?: Project | null;

  @Column({ name: "scope_kind", default: "project" })
  scopeKind: ArtifactRetentionScopeKind = "project";

  @Column({ name: "artifact_kind" })
  artifactKind!: ArtifactRetentionArtifactKind;

  @Column({ type: "integer", name: "retention_days", nullable: true })
  retentionDays: number | null = null;

  @Column({ type: "boolean", name: "keep_latest_per_ref", default: true })
  keepLatestPerRef: boolean = true;

  @Column({ type: "boolean", name: "keep_pinned", default: true })
  keepPinned: boolean = true;

  @Column({ type: "boolean", default: true })
  enabled: boolean = true;

  @Column({ type: "text", nullable: true })
  notes?: string | null;

  @Column({ name: "created_by", nullable: true })
  createdBy?: string | null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}

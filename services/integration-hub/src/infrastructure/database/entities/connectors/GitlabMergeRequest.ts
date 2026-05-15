import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("gitlab_merge_requests")
@Index("gitlab_merge_requests_org_project", ["org", "projectId"])
@Index() // expression: CREATE UNIQUE INDEX "gitlab_merge_requests_repo_external_unique" ON "gitlab_merge_requests" ("repo_path", "merge_request_iid")
export class GitlabMergeRequest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "project_id" })
  projectId!: string;

  @Column({ type: "varchar", name: "repo_path" })
  repoPath!: string;

  @Column({ type: "varchar", name: "merge_request_iid" })
  mergeRequestIid!: string;

  @Column({ type: "varchar" })
  title!: string;

  @Column({ type: "varchar" })
  state!: string;

  @Column({ type: "varchar", nullable: true })
  url?: string | null;

  @Column({ type: "jsonb" })
  payload: Record<string, unknown> = {};

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}

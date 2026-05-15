import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "../auth/Org.ts";

@Entity("gitlab_merge_requests")
@Index("gitlab_merge_requests_org_project", ["org", "projectId"])
@Index() // expression: CREATE UNIQUE INDEX "gitlab_merge_requests_repo_external_unique" ON "gitlab_merge_requests" ("repo_path", "merge_request_iid")
export class GitlabMergeRequest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id" })
  projectId!: string;

  @Column({ name: "repo_path" })
  repoPath!: string;

  @Column({ name: "merge_request_iid" })
  mergeRequestIid!: string;

  @Column()
  title!: string;

  @Column()
  state!: string;

  @Column({ nullable: true })
  url?: string | null;

  @Column({ type: "jsonb" })
  payload: Record<string, unknown> = {};

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}

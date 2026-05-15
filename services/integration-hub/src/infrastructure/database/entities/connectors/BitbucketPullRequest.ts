import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("bitbucket_pull_requests")
@Index("bitbucket_pull_requests_org_project", ["org", "projectId"])
@Index() // expression: CREATE UNIQUE INDEX "bitbucket_pull_requests_repo_external_unique" ON "bitbucket_pull_requests" ("repo_slug", "pull_request_id")
export class BitbucketPullRequest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE", eager: true })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "project_id" })
  projectId!: string;

  @Column({ type: "varchar", name: "repo_slug" })
  repoSlug!: string;

  @Column({ type: "varchar", name: "pull_request_id" })
  pullRequestId!: string;

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

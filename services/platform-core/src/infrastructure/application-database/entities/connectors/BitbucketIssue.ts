import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "../auth/Org.ts";

@Entity("bitbucket_issues")
@Index("bitbucket_issues_org_project", ["org", "projectId"])
@Index() // expression: CREATE UNIQUE INDEX "bitbucket_issues_repo_external_unique" ON "bitbucket_issues" ("repo_slug", "issue_id")
export class BitbucketIssue {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id" })
  projectId!: string;

  @Column({ name: "repo_slug" })
  repoSlug!: string;

  @Column({ name: "issue_id" })
  issueId!: string;

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

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("gitlab_issues")
@Index("gitlab_issues_org_project", ["org", "projectId"])
@Index() // expression: CREATE UNIQUE INDEX "gitlab_issues_repo_external_unique" ON "gitlab_issues" ("repo_path", "issue_iid")
export class GitlabIssue {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id" })
  projectId!: string;

  @Column({ name: "repo_path" })
  repoPath!: string;

  @Column({ name: "issue_iid" })
  issueIid!: string;

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

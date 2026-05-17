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

  @ManyToOne(() => Org, { onDelete: "CASCADE", eager: true })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "project_id" })
  projectId!: string;

  @Column({ type: "varchar", name: "repo_path" })
  repoPath!: string;

  @Column({ type: "varchar", name: "issue_iid" })
  issueIid!: string;

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

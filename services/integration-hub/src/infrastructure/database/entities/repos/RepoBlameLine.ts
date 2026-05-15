import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Repo } from "./Repo.ts";

@Entity("repo_blame_lines")
@Index("repo_blame_lines_org_project", ["org", "projectId"])
@Index() // expression: CREATE UNIQUE INDEX "repo_blame_lines_repo_path_line_unique" ON "repo_blame_lines" ("repo_id", "path", "line_number")
export class RepoBlameLine {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id" })
  projectId!: string;

  @ManyToOne(() => Repo, { onDelete: "CASCADE" })
  @JoinColumn({ name: "repo_id" })
  repo!: Repo;

  @Column({ type: "text" })
  path!: string;

  @Column({ type: "integer", name: "line_number" })
  lineNumber!: number;

  @Column({ name: "commit_sha" })
  commitSha!: string;

  @Column({ name: "author_name" })
  authorName!: string;

  @Column({ name: "author_email", nullable: true })
  authorEmail?: string | null;

  @Column({ type: "timestamptz", name: "committed_at" })
  committedAt!: Date;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}

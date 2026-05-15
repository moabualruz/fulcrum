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

@Entity("repo_tree_entries")
@Index("repo_tree_entries_org_project", ["org", "projectId"])
@Index() // expression: CREATE UNIQUE INDEX "repo_tree_entries_repo_commit_path_unique" ON "repo_tree_entries" ("repo_id", "commit_sha", "path")
export class RepoTreeEntry {
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

  @Column({ name: "commit_sha" })
  commitSha!: string;

  @Column({ type: "text" })
  path!: string;

  @Column()
  kind!: string;

  @Column({ type: "bigint", nullable: true })
  size?: number | null;

  @Column({ name: "content_hash", nullable: true })
  contentHash?: string | null;

  @Column({ type: "jsonb" })
  payload: Record<string, unknown> = {};

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}

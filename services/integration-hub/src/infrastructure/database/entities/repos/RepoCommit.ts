/**
 * RepoCommit entity — repos domain (Pillar 9).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Repo } from "./Repo.ts";

@Entity("repo_commits")
@Index() // expression: CREATE UNIQUE INDEX "repo_commits_repo_sha_unique" ON "repo_commits" ("repo_id", "sha")
@Index() // expression: CREATE INDEX "repo_commits_repo_committed_at" ON "repo_commits" ("repo_id", "committed_at" DESC)
@Index() // expression: CREATE INDEX "repo_commits_org_repo" ON "repo_commits" ("org_id", "repo_id")
export class RepoCommit {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => Repo, { onDelete: "CASCADE" })
  @JoinColumn({ name: "repo_id" })
  repo!: Repo;

  @Column()
  sha!: string;

  @Column({ type: "text", nullable: true })
  message?: string | null;

  @Column({ nullable: true })
  author?: string | null;

  @Column({ type: "timestamptz", name: "committed_at", nullable: true })
  committedAt?: Date | null;
}

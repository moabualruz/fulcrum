/**
 * RepoFilesIndex entity — repos domain (Pillar 9).
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

@Entity("repo_files_index")
@Index() // expression: CREATE UNIQUE INDEX "repo_files_repo_path_unique" ON "repo_files_index" ("repo_id", "path")
@Index() // expression: CREATE INDEX "repo_files_org_repo_kind" ON "repo_files_index" ("org_id", "repo_id", "kind")
export class RepoFilesIndex {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => Repo, { onDelete: "CASCADE" })
  @JoinColumn({ name: "repo_id" })
  repo!: Repo;

  @Column({ type: "text" })
  path!: string;

  @Column({ type: "varchar" })
  kind!: string;

  @Column({ type: "bigint", nullable: true })
  size?: number | null;
}

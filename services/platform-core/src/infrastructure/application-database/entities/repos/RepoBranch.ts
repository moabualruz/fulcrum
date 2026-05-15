/**
 * RepoBranch entity — repos domain (Pillar 9).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";
import { Repo } from "./Repo.ts";

@Entity("repo_branches")
@Index() // expression: CREATE UNIQUE INDEX "repo_branches_repo_name_unique" ON "repo_branches" ("repo_id", "name")
@Index() // expression: CREATE INDEX "repo_branches_org_repo" ON "repo_branches" ("org_id", "repo_id")
export class RepoBranch {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => Repo, { onDelete: "CASCADE" })
  @JoinColumn({ name: "repo_id" })
  repo!: Repo;

  @Column()
  name!: string;

  @Column({ nullable: true })
  sha?: string | null;

  @Column({ type: "boolean", name: "is_default", default: false })
  isDefault: boolean = false;
}

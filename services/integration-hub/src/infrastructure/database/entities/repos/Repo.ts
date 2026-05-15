/**
 * Repo entity — repos domain (Pillar 9).
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

@Entity("repos")
@Index("idx_repos_org_slug", ["org", "slug"])
@Index() // expression: CREATE UNIQUE INDEX "repos_org_slug" ON "repos" ("org_id", "slug")
@Index() // expression: CREATE INDEX "repos_org_touched" ON "repos" ("org_id", "last_touched_at" DESC)
@Index() // expression: CREATE INDEX "repos_kind_status" ON "repos" ("kind", "sync_status")
export class Repo {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar" })
  slug!: string;

  @Column({ type: "varchar" })
  kind!: "local" | "remote";

  @Column({ type: "varchar", name: "local_path", nullable: true })
  localPath?: string | null;

  @Column({ type: "varchar", name: "remote_url", nullable: true })
  remoteUrl?: string | null;

  @Column({ type: "varchar", name: "default_branch", nullable: true })
  defaultBranch?: string | null;

  @Column({ type: "varchar", name: "current_branch", nullable: true })
  currentBranch?: string | null;

  @Column({ type: "timestamptz", name: "last_sync_at", nullable: true })
  lastSyncAt?: Date | null;

  @Column({ type: "varchar", name: "sync_status", default: "idle" })
  syncStatus: string = "idle";

  @Column({ type: "timestamptz", name: "last_touched_at", nullable: true })
  lastTouchedAt?: Date | null;

  @Column({ type: "boolean", default: false })
  archived: boolean = false;
}

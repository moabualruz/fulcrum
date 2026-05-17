/**
 * SavedSearch entity.
 *
 * Backed by the `saved_views` table (view_type = 'search').
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

export const SAVED_SEARCH_SCOPES = ["private", "project", "org"] as const;
export type SavedSearchScope = (typeof SAVED_SEARCH_SCOPES)[number];

@Entity("saved_views")
@Index("saved_searches_org_user", ["org", "createdById"])
export class SavedSearch {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "created_by" })
  userId!: string;

  @Column({ type: "varchar", name: "created_by", select: false, insert: false, update: false })
  createdById!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "jsonb", name: "query_json" })
  queryJson!: Record<string, unknown>;

  @Column({ type: "varchar", default: "private" })
  scope: SavedSearchScope = "private";

  @Column({ type: "varchar", name: "project_id", nullable: true })
  projectId: string | null = null;

  @Column({ type: "varchar", name: "view_type", default: "search" })
  viewType: string = "search";

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}

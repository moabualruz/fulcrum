/**
 * SavedView entity for reusable task filter views.
 *
 * Stores named, shareable filter views for tasks. The `query_json` column
 * holds a serialised `SavedViewQuery` AST; `order_by` holds an
 * `OrderByClause[]` array.
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import type { SavedViewQuery, OrderByClause } from "@work-management/application/saved-views/filter-query.ts";

export const SAVED_VIEW_SCOPES = ["private", "project", "org"] as const;
export type SavedViewScope = (typeof SAVED_VIEW_SCOPES)[number];

export const SAVED_VIEW_TYPES = [
  "kanban",
  "table",
  "calendar",
  "timeline",
  "list",
  "search",
] as const;
export type SavedViewType = (typeof SAVED_VIEW_TYPES)[number];

@Entity("saved_views")
@Index("saved_views_org_project", ["org", "projectId"])
@Index("saved_views_created_by", ["createdById"])
export class SavedView {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  /** Nullable: org-scoped views have no project. */
  @Column({ name: "project_id", nullable: true })
  projectId: string | null = null;

  // Note: check constraint "scope in ('private','project','org')" — handle in migration
  @Column({ default: "private" })
  scope: SavedViewScope = "private";

  @Column()
  name!: string;

  @Column({ type: "jsonb", name: "query_json", default: () => "'{}'::jsonb" })
  queryJson: SavedViewQuery = { filters: [], text: "", facets: {} };

  @Column({ type: "jsonb", name: "order_by", default: () => "'[]'::jsonb" })
  orderBy: OrderByClause[] = [];

  // Note: check constraint "view_type in ('kanban','table','calendar','timeline','list','search')" — handle in migration
  @Column({ name: "view_type", default: "list" })
  viewType: SavedViewType = "list";

  /** FK → users(id). Migration adds constraint conditionally. */
  @Column({ name: "created_by" })
  createdById!: string;

  /** Postgres text[] — user IDs granted read access. */
  @Column({ type: "simple-array", name: "shared_with_users", default: "" })
  sharedWithUsers: string[] = [];

  /** Postgres text[] — team IDs granted read access. */
  @Column({ type: "simple-array", name: "shared_with_teams", default: "" })
  sharedWithTeams: string[] = [];

  /** Free-form tag making this view the default for a given context, e.g. 'project-board'. */
  @Column({ name: "default_for", nullable: true })
  defaultFor: string | null = null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}

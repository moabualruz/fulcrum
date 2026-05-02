/**
 * SavedView entity — tasks domain (Pillar 6 T6-04).
 *
 * Stores named, shareable filter views for tasks. The `query_json` column
 * holds a serialised `SavedViewQuery` AST (src/filters/ast.ts); `order_by`
 * holds an `OrderByClause[]` array.
 *
 * Q10: DB-persisted, shareable — scope controls visibility:
 *   private (owner only) | project (project members) | org (whole org).
 * Q27: SavedViewQuery AST is shared with Pillar 11 search.
 * C2: Composite (org_id, project_id) index from day 1.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 *     Stage-3 decorators do NOT emit reflect-metadata type info — explicit
 *     `type` is required on every @Property/@PrimaryKey decorator.
 * C9: Entity lives at src/db/entities/tasks/SavedView.ts.
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";
import type { SavedViewQuery, OrderByClause } from "../../../filters/ast.ts";

export const SAVED_VIEW_SCOPES = ["private", "project", "org"] as const;
export type SavedViewScope = (typeof SAVED_VIEW_SCOPES)[number];

export const SAVED_VIEW_TYPES = [
  "kanban",
  "table",
  "calendar",
  "timeline",
  "list",
] as const;
export type SavedViewType = (typeof SAVED_VIEW_TYPES)[number];

@Entity({ tableName: "saved_views" })
@Index({
  name: "saved_views_org_project",
  properties: ["org", "projectId"],
})
@Index({
  name: "saved_views_created_by",
  properties: ["createdById"],
})
export class SavedView {
  [OptionalProps]?:
    | "projectId"
    | "scope"
    | "viewType"
    | "queryJson"
    | "orderBy"
    | "sharedWithUsers"
    | "sharedWithTeams"
    | "defaultFor"
    | "createdAt"
    | "updatedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  /** Nullable: org-scoped views have no project. */
  @Property({ type: "uuid", fieldName: "project_id", nullable: true })
  projectId: string | null = null;

  @Property({
    type: "string",
    default: "private",
    check: "scope in ('private','project','org')",
  })
  scope: SavedViewScope = "private";

  @Property({ type: "string" })
  name!: string;

  @Property({
    type: "json",
    fieldName: "query_json",
    defaultRaw: "'{}'::jsonb",
    returning: false,
  })
  queryJson: SavedViewQuery = { filters: [], text: "", facets: {} };

  @Property({
    type: "json",
    fieldName: "order_by",
    defaultRaw: "'[]'::jsonb",
    returning: false,
  })
  orderBy: OrderByClause[] = [];

  @Property({
    type: "string",
    fieldName: "view_type",
    default: "list",
    check: "view_type in ('kanban','table','calendar','timeline','list')",
  })
  viewType: SavedViewType = "list";

  /** FK → users(id). Migration adds constraint conditionally. */
  @Property({ type: "uuid", fieldName: "created_by" })
  createdById!: string;

  /** Postgres text[] — user IDs granted read access. */
  @Property({ type: "array", fieldName: "shared_with_users", default: [] })
  sharedWithUsers: string[] = [];

  /** Postgres text[] — team IDs granted read access. */
  @Property({ type: "array", fieldName: "shared_with_teams", default: [] })
  sharedWithTeams: string[] = [];

  /** Free-form tag making this view the default for a given context, e.g. 'project-board'. */
  @Property({ type: "string", fieldName: "default_for", nullable: true })
  defaultFor: string | null = null;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({
    type: "datetime",
    fieldName: "updated_at",
    defaultRaw: "now()",
    onUpdate: () => new Date(),
  })
  updatedAt!: Date;
}

/**
 * SavedSearch entity — search domain (Phase 06 D-18).
 *
 * Backed by the `saved_views` table (view_type = 'search').
 * This entity delegates storage to SavedView to avoid duplicate tables.
 *
 * For full CRUD, use `src/search/saved-searches.ts` service functions
 * which operate on SavedView with viewType='search' filter.
 *
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";

export const SAVED_SEARCH_SCOPES = ["private", "project", "org"] as const;
export type SavedSearchScope = (typeof SAVED_SEARCH_SCOPES)[number];

/**
 * SavedSearch maps to `saved_views` table (view_type = 'search').
 * Uses a discriminated sub-view of SavedView — not a separate table.
 */
@Entity({ tableName: "saved_views" })
@Index({
  name: "saved_searches_org_user",
  properties: ["org", "createdById"],
})
export class SavedSearch {
  [OptionalProps]?: "createdAt" | "updatedAt" | "projectId";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  /** Denormalized org_id for query convenience */
  @Property({ type: "uuid", fieldName: "org_id", persist: false })
  orgId!: string;

  /** User who created the saved search (FK to users.id) */
  @Property({ type: "uuid", fieldName: "created_by" })
  userId!: string;

  /** Alias for MikroORM convention; same column as userId */
  @Property({ type: "uuid", fieldName: "created_by", persist: false })
  createdById!: string;

  @Property({ type: "string" })
  name!: string;

  /** JSON blob: { text, filters, facets } */
  @Property({ type: "json", fieldName: "query_json" })
  queryJson!: Record<string, unknown>;

  @Property({
    type: "string",
    default: "private",
    check: "scope in ('private','project','org')",
  })
  scope: SavedSearchScope = "private";

  @Property({ type: "uuid", fieldName: "project_id", nullable: true })
  projectId: string | null = null;

  /** Discriminator: always 'search' for SavedSearch rows */
  @Property({ type: "string", fieldName: "view_type", default: "search" })
  viewType: string = "search";

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}

import type { ProductDb } from "./db/types.ts";
import { newUlid } from "./ids.ts";

export interface SavedSearchRow {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  query_json: string; // JSON string from DB
  scope: "private" | "project" | "org";
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSavedSearchInput {
  orgId: string;
  userId: string;
  name: string;
  queryJson: Record<string, unknown>;
  scope: "private" | "project" | "org";
  projectId?: string | null;
}

export async function createSavedSearch(
  db: ProductDb,
  input: CreateSavedSearchInput,
): Promise<SavedSearchRow> {
  const id = newUlid();
  const rows = await db.query<SavedSearchRow>(
    `INSERT INTO saved_searches (id, org_id, user_id, name, query_json, scope, project_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     RETURNING *`,
    [
      id,
      input.orgId,
      input.userId,
      input.name,
      JSON.stringify(input.queryJson),
      input.scope,
      input.projectId ?? null,
    ],
  );
  return rows[0]!;
}

export interface ListSavedSearchFilters {
  orgId: string;
  userId: string;
}

/**
 * List saved searches visible to the given user:
 * - private: only own
 * - project/org: visible to all members (simplified — no permission check here)
 */
export async function listSavedSearches(
  db: ProductDb,
  filters: ListSavedSearchFilters,
): Promise<SavedSearchRow[]> {
  return db.query<SavedSearchRow>(
    `SELECT * FROM saved_searches
     WHERE org_id = $1
       AND (user_id = $2 OR scope IN ('project', 'org'))
     ORDER BY created_at DESC`,
    [filters.orgId, filters.userId],
  );
}

export async function deleteSavedSearch(
  db: ProductDb,
  id: string,
  userId: string,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `DELETE FROM saved_searches WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId],
  );
  return rows.length > 0;
}

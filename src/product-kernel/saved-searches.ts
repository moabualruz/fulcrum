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
  await ensureSavedSearchColumns(db);
  const rows = await db.query<Record<string, unknown>>(
    `INSERT INTO saved_searches (id, org_id, owner, name, params, scope, project_id)
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
  return toSavedSearchRow(rows[0]!);
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
  await ensureSavedSearchColumns(db);
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM saved_searches
     WHERE org_id = $1
       AND (owner = $2 OR scope IN ('project', 'org'))
     ORDER BY created_at DESC`,
    [filters.orgId, filters.userId],
  );
  return rows.map(toSavedSearchRow);
}

export async function deleteSavedSearch(
  db: ProductDb,
  id: string,
  userId: string,
): Promise<boolean> {
  await ensureSavedSearchColumns(db);
  const rows = await db.query<{ id: string }>(
    `DELETE FROM saved_searches WHERE id = $1 AND owner = $2 RETURNING id`,
    [id, userId],
  );
  return rows.length > 0;
}

async function ensureSavedSearchColumns(db: ProductDb): Promise<void> {
  await db.exec(`
    ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'private';
    ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS project_id text;
  `);
}

function toSavedSearchRow(row: Record<string, unknown>): SavedSearchRow {
  return {
    id: row.id as string,
    org_id: row.org_id as string,
    user_id: row.owner as string,
    name: row.name as string,
    query_json: JSON.stringify(row.params ?? {}),
    scope: row.scope as "private" | "project" | "org",
    project_id: (row.project_id as string) ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at as string,
    updated_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at as string,
  };
}

import type { ProductDb } from "./db/types.ts";

export interface SuggestFilters {
  orgId: string;
  kind?: string | null;
  limit?: number;
}

/**
 * Prefix autocomplete: returns up to `limit` (default 5) titles
 * matching the given prefix, optionally scoped by source_kind.
 */
export async function suggestTitles(
  db: ProductDb,
  prefix: string,
  filters: SuggestFilters,
): Promise<string[]> {
  const limit = filters.limit ?? 5;
  const params: (string | number)[] = [filters.orgId, `${prefix}%`, limit];
  let where = "org_id = $1 AND title ILIKE $2";
  if (filters.kind) {
    params.push(filters.kind);
    where += ` AND source_kind = $${params.length}`;
  }
  const rows = await db.query<{ title: string }>(
    `SELECT DISTINCT title FROM search_documents
     WHERE ${where}
     ORDER BY title ASC
     LIMIT $3`,
    params as never,
  );
  return rows.map((r) => r.title);
}

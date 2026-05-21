import { getE2eFixtureContext } from "$lib/server/db";

/**
 * E2E-only search fixture path.
 *
 * Under `FULCRUM_E2E=1` the search route falls back to the seeded fixture
 * database when the public search API returns no hits. The raw fixture query
 * lives here — in a dedicated `$lib/server` helper — rather than inside the
 * `search/+page.server.ts` loader, so the route loader stays free of direct
 * database access (web route loaders delegate to APIs / server helpers; see
 * `application-adapters.test.ts` boundary guards).
 */
export interface E2eSearchHit {
  id: string;
  source_kind: string;
  source_id: string;
  title: string;
  body: string;
  score: number;
  updated_at: string;
}

export async function queryE2eFixtureSearch(input: { q: string; kinds: string[] }): Promise<E2eSearchHit[]> {
  const { db, orgId } = await getE2eFixtureContext();
  const params: unknown[] = [orgId, `%${input.q.toLowerCase()}%`];
  const kindSql = input.kinds.length > 0
    ? `AND entry.source_kind = ANY($${params.push(input.kinds)}::text[])`
    : "";
  const rows = await db.em.query(
    `SELECT
       entry.id,
       entry.source_kind,
       entry.page_id AS source_id,
       entry.title,
       entry.search_text AS body,
       entry.updated_at
     FROM fulcrum_doc_search_entries entry
     INNER JOIN fulcrum_projects project ON project.id = entry.project_id
     WHERE project.workspace_id = $1
       AND lower(entry.title || ' ' || entry.search_text) LIKE $2
       ${kindSql}
     ORDER BY entry.updated_at DESC, entry.id ASC
     LIMIT 50`,
    params,
  ) as Array<Omit<E2eSearchHit, "score" | "updated_at"> & { updated_at: Date | string }>;
  return rows.map((row) => ({
    id: row.id,
    source_kind: row.source_kind,
    source_id: row.source_id,
    title: row.title,
    body: row.body,
    score: 1,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  }));
}

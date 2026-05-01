import type { ServerLoad } from "@sveltejs/kit";
import { openProductDb } from "$lib/server/db";
import { searchProductDocuments } from "../../../../product-kernel/search.ts";
import type { SearchHit } from "../../../../product-kernel/search";

type ProductDb = Awaited<ReturnType<typeof openProductDb>>;
type GroupedSearchHits = Record<string, SearchHit[]>;

async function defaultOrgId(db: ProductDb): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM orgs WHERE slug = $1`,
    ["default"],
  );
  return rows[0]?.id ?? null;
}

function groupBySourceKind(hits: SearchHit[]): GroupedSearchHits {
  const grouped: GroupedSearchHits = {};
  for (const hit of hits) {
    grouped[hit.source_kind] ??= [];
    grouped[hit.source_kind]!.push(hit);
  }
  return grouped;
}

export const load: ServerLoad = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length === 0) return { q: "", hits: [], grouped: {} };

  const db = await openProductDb();
  try {
    const orgId = await defaultOrgId(db);
    if (!orgId) return { q, hits: [], grouped: {} };

    const hits = await searchProductDocuments(db, q, { orgId, limit: 50 });
    return { q, hits, grouped: groupBySourceKind(hits) };
  } finally {
    await db.close();
  }
};

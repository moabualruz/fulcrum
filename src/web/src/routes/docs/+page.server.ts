import type { PageServerLoad } from "./$types";
import { openProductDb } from "$lib/server/db";
import { searchProductDocuments } from "../../../../product-kernel/search.ts";

interface DocRow {
  id: string;
  title: string;
  kind: string;
  project_id: string | null;
  updated_at: string;
  body_excerpt: string;
}

interface RawRow {
  id: string;
  title: string;
  kind: string;
  project_id: string | null;
  updated_at: string | Date;
  body_excerpt: string | null;
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export const load: PageServerLoad = async ({ url, parent }) => {
  // Inherit `activeProjectId` from the root layout-data so the optional
  // project scoping is consistent with `/projects`. Tests for the route
  // load do not always supply `parent`; guard for legacy callers.
  const parentData =
    typeof parent === "function"
      ? await parent()
      : ({ activeProjectId: null } as { activeProjectId: string | null });
  const activeProjectId = parentData.activeProjectId ?? null;
  const kindFilter = url.searchParams.get("kind") ?? "";
  const q = url.searchParams.get("q") ?? "";

  const db = await openProductDb();
  try {
    let documents: DocRow[];
    if (q.trim().length > 0) {
      const orgRows = await db.query<{ id: string }>(
        `SELECT id FROM orgs WHERE slug = $1`,
        ["default"],
      );
      const orgId = orgRows[0]?.id;
      if (!orgId) {
        documents = [];
      } else {
        const hits = await searchProductDocuments(db, q, {
          orgId,
          sourceKinds: ["document"],
        });
        documents = hits.map((h) => ({
          id: h.source_id,
          title: h.title,
          kind: kindFilter || "document",
          project_id: null,
          updated_at: isoStamp(h.updated_at),
          body_excerpt: h.body.slice(0, 200),
        }));
        if (kindFilter) {
          documents = documents.filter((d) => d.kind === kindFilter);
        }
      }
    } else {
      const rows = await db.query<RawRow>(
        `SELECT id, title, kind, project_id, updated_at,
                substring(body, 1, 200) AS body_excerpt
           FROM documents
          WHERE ($1::text IS NULL OR kind = $1)
            AND ($2::text IS NULL OR project_id = $2)
          ORDER BY updated_at DESC, id ASC`,
        [kindFilter || null, activeProjectId],
      );
      documents = rows.map((r) => ({
        id: r.id,
        title: r.title,
        kind: r.kind,
        project_id: r.project_id,
        updated_at: isoStamp(r.updated_at),
        body_excerpt: r.body_excerpt ?? "",
      }));
    }
    return {
      documents,
      kind: kindFilter,
      q,
      activeProjectId,
    };
  } finally {
    await db.close();
  }
};

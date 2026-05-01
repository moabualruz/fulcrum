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

type ProductDb = Awaited<ReturnType<typeof openProductDb>>;

async function loadDocuments(
  db: ProductDb,
  kindFilter: string,
  q: string,
  activeProjectId: string | null,
): Promise<{ documents: DocRow[] }> {
  if (q.trim().length > 0) {
    const orgRows = await db.query<{ id: string }>(
      `SELECT id FROM orgs WHERE slug = $1`,
      ["default"],
    );
    const orgId = orgRows[0]?.id;
    if (!orgId) return { documents: [] };
    let documents = (await searchProductDocuments(db, q, {
      orgId,
      sourceKinds: ["document"],
    })).map((h) => ({
      id: h.source_id,
      title: h.title,
      kind: kindFilter || "document",
      project_id: null,
      updated_at: isoStamp(h.updated_at),
      body_excerpt: h.body.slice(0, 200),
    }));
    if (kindFilter) documents = documents.filter((d) => d.kind === kindFilter);
    return { documents };
  }
  const rows = await db.query<RawRow>(
    `SELECT id, title, kind, project_id, updated_at,
            substring(body, 1, 200) AS body_excerpt
       FROM documents
      WHERE ($1::text IS NULL OR kind = $1)
        AND ($2::text IS NULL OR project_id = $2)
      ORDER BY updated_at DESC, id ASC`,
    [kindFilter || null, activeProjectId],
  );
  return {
    documents: rows.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      project_id: r.project_id,
      updated_at: isoStamp(r.updated_at),
      body_excerpt: r.body_excerpt ?? "",
    })),
  };
}

export const load: PageServerLoad = ({ url, locals }) => {
  const activeProjectId = locals?.activeProjectId ?? null;
  const kind = url.searchParams.get("kind") ?? "";
  const q = url.searchParams.get("q") ?? "";
  return {
    activeProjectId,
    kind,
    q,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          return await loadDocuments(db, kind, q, activeProjectId);
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

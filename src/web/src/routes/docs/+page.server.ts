import type { PageServerLoad } from "./$types";
import { openProductDb } from "$lib/server/db";
import { searchProductDocuments } from "../../../../product-kernel/search.ts";
import { buildDocTree, type DocScope, type DocTreeNode } from "$lib/components/docs/doc-tree";

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

interface RawTreeRow {
  id: string;
  title: string | null;
  slug: string | null;
  parent_id: string | null;
  project_id: string | null;
  scope: DocScope;
  doc_type: string | null;
  sort_position: number | string | null;
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

function normalizeTreeRows(rows: RawTreeRow[]): DocTreeNode[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? row.slug ?? row.id,
    slug: row.slug ?? row.id,
    parentId: row.parent_id,
    projectId: row.project_id,
    scope: row.scope,
    docType: row.doc_type ?? "note",
    sortPosition: Number(row.sort_position ?? 0),
    children: [],
  }));
}

async function loadDocTree(
  db: ProductDb,
  scope: DocScope,
  activeProjectId: string | null,
): Promise<DocTreeNode[]> {
  const rows = await db.query<RawTreeRow>(
    `SELECT id,
            COALESCE(frontmatter->>'title', title, id) AS title,
            id AS slug,
            NULL::text AS parent_id,
            project_id,
            CASE WHEN project_id IS NULL THEN 'global' ELSE 'project' END AS scope,
            COALESCE(kind, 'note') AS doc_type,
            0 AS sort_position
       FROM documents
      WHERE (($1 = 'global' AND project_id IS NULL) OR ($1 = 'project' AND project_id IS NOT NULL))
        AND ($2::text IS NULL OR project_id = $2)
      ORDER BY title ASC, id ASC`,
    [scope, scope === "project" ? activeProjectId : null],
  );
  return buildDocTree(normalizeTreeRows(rows));
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
          const [list, projectTree, globalTree] = await Promise.all([
            loadDocuments(db, kind, q, activeProjectId),
            loadDocTree(db, "project", activeProjectId),
            loadDocTree(db, "global", null),
          ]);
          return { ...list, projectTree, globalTree };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

// @ts-nocheck — checked by web:check; root tsc lacks SvelteKit $types/$lib
import { error, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { deleteDocumentAction } from "$lib/server/documents";
import { renderDocMarkdownToHtml } from "./doc-render";

interface DocRow {
  id: string;
  org_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  updated_at: Date | string;
}

type ProductDb = Awaited<ReturnType<typeof openProductDb>>;
interface BacklinkRow {
  id: string;
  title: string;
}

async function loadDoc(db: ProductDb, id: string, orgId: string): Promise<{ doc: {
  id: string;
  org_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  renderedHtml: string;
  updated_at: string;
}; backlinks: Array<{ id: string; title: string; href: string }> }> {
  const rows = await db.query<DocRow>(
    `SELECT id, org_id, project_id, kind, title, body, frontmatter, updated_at
       FROM documents WHERE id = $1 AND org_id = $2`,
    [id, orgId],
  );
  if (rows.length === 0) throw error(404, "Document not found");
  const row = rows[0]!;
  return {
    doc: {
      id: row.id,
      org_id: row.org_id,
      project_id: row.project_id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      frontmatter: row.frontmatter ?? {},
      renderedHtml: renderDocMarkdownToHtml(row.body),
      updated_at:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at,
    },
    backlinks: await loadBacklinks(db, id, orgId),
  };
}

async function loadBacklinks(
  db: ProductDb,
  id: string,
  orgId: string,
): Promise<Array<{ id: string; title: string; href: string }>> {
  if (!(await relationExists(db, "doc_links"))) return [];
  const rows = await db.query<BacklinkRow>(
    `SELECT d.id, d.title
       FROM doc_links l
       JOIN documents d ON d.id = l.from_doc_id AND d.org_id = l.org_id
      WHERE l.to_doc_id = $1 AND l.org_id = $2
      ORDER BY d.updated_at DESC, d.title ASC`,
    [id, orgId],
  );
  return rows.map((row) => ({ id: row.id, title: row.title, href: `/docs/${row.id}` }));
}

async function relationExists(db: ProductDb, name: string): Promise<boolean> {
  const rows = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    [name],
  );
  return rows[0]?.exists === true;
}

export const load: PageServerLoad = ({ params, locals }) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const db = await openProductDb();
      try {
        const orgId = await getDefaultOrgId(db);
        return await loadDoc(db, params.id, orgId);
      } finally {
        await db.close();
      }
    })(),
  },
});

export const actions: Actions = {
  delete: async ({ params }) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    await deleteDocumentAction(db, params.id!, orgId);
  } finally {
    await db.close();
  }
  throw redirect(303, "/docs");
  },
};

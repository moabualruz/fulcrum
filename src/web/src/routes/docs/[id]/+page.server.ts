import { error, redirect } from "@sveltejs/kit";
import { openProductDb, getDefaultOrgId } from "../../../lib/server/db.ts";
import { deleteDocumentAction } from "../../../lib/server/documents.ts";
import { getBacklinks } from "../../../lib/server/doc-links.ts";
import { renderDocMarkdownToHtml } from "./doc-render.ts";

interface DocRow {
  id: string;
  org_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  renderedHtml: string;
  frontmatter: Record<string, unknown>;
  updated_at: Date | string;
}

type ProductDb = Awaited<ReturnType<typeof openProductDb>>;

interface LoadEvent {
  params: { id: string };
  locals?: { activeProjectId?: string | null };
}

interface ActionEvent {
  params: { id: string };
}

async function loadDoc(db: ProductDb, id: string, orgId: string): Promise<{ doc: {
  id: string;
  org_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  renderedHtml: string;
  frontmatter: Record<string, unknown>;
  updated_at: string;
} }> {
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
      renderedHtml: renderDocMarkdownToHtml(row.body),
      frontmatter: row.frontmatter ?? {},
      updated_at:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at,
    },
  };
}

export const load = ({ params, locals }: LoadEvent) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const db = await openProductDb();
      try {
        const orgId = await getDefaultOrgId(db);
        const docResult = await loadDoc(db, params.id, orgId);
        const backlinks = (await getBacklinks(db, params.id)).map((backlink) => ({
          id: backlink.source_doc_id,
          title: backlink.title,
          href: `/docs/${backlink.source_doc_id}`,
        }));
        return { ...docResult, backlinks };
      } finally {
        await db.close();
      }
    })(),
  },
});

export const actions = {
  delete: async ({ params }: ActionEvent) => {
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

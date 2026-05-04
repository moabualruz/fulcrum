import { error, redirect } from "@sveltejs/kit";
import type { EntityManager } from "@mikro-orm/postgresql";
import { getEm, getDefaultOrgIdOrm } from "../../../lib/server/em.ts";
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
  frontmatter: Record<string, unknown>;
  updated_at: Date | string;
}

interface LoadEvent {
  params: { id: string };
  locals?: { activeProjectId?: string | null };
}

interface ActionEvent {
  params: { id: string };
}

async function loadDoc(em: EntityManager, id: string, orgId: string): Promise<{ doc: {
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
  const conn = em.getConnection();
  const rows = await conn.execute<DocRow[]>(
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
      const em = await getEm();
      const orgId = await getDefaultOrgIdOrm(em);
      const docResult = await loadDoc(em, params.id, orgId);
      const backlinks = (await getBacklinks(em, params.id)).map((backlink) => ({
        id: backlink.source_doc_id,
        title: backlink.title,
        href: `/docs/${backlink.source_doc_id}`,
      }));
      return { ...docResult, backlinks };
    })(),
  },
});

export const actions = {
  delete: async ({ params }: ActionEvent) => {
    const em = await getEm();
    const orgId = await getDefaultOrgIdOrm(em);
    await deleteDocumentAction(em, params.id!, orgId);
    throw redirect(303, "/docs");
  },
};

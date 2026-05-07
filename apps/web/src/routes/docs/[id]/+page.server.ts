import { error, redirect } from "@sveltejs/kit";
import { deleteDocumentAction } from "@/application/docs/document-actions.ts";
import { getDoc, listDocBacklinks } from "@/application/docs/queries.ts";
import { requestAppScope } from "../../../lib/server/application-scope.ts";
import { renderDocMarkdownToHtml } from "./doc-render.ts";

interface LoadEvent {
  params: { id: string };
  locals: Parameters<typeof requestAppScope>[0] & { activeProjectId?: string | null };
}

interface ActionEvent {
  params: { id: string };
  locals: Parameters<typeof requestAppScope>[0];
}

export const load = ({ params, locals }: LoadEvent) => ({
  activeProjectId: locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const { em, ctx } = await requestAppScope(locals);
      const doc = await getDoc(em, ctx, params.id);
      if (!doc) throw error(404, "Document not found");
      const docResult = {
        doc: {
          id: doc.id,
          org_id: doc.orgId,
          project_id: doc.projectId,
          kind: doc.docType,
          title: doc.title,
          body: doc.bodyMd,
          renderedHtml: renderDocMarkdownToHtml(doc.bodyMd),
          frontmatter: doc.frontmatter ?? {},
          updated_at: doc.updatedAt.toISOString(),
        },
      };
      const backlinks = (await listDocBacklinks(em, ctx, params.id)).map((backlink) => ({
        id: backlink.fromDocId,
        title: backlink.title,
        href: `/docs/${backlink.fromDocId}`,
      }));
      return { ...docResult, backlinks };
    })(),
  },
});

export const actions = {
  delete: async ({ params, locals }: ActionEvent) => {
    const { em, ctx } = await requestAppScope(locals);
    await deleteDocumentAction(em, params.id!, ctx.orgId);
    throw redirect(303, "/docs");
  },
};

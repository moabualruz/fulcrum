import { error, redirect } from "@sveltejs/kit";
import { createDocumentApiForEvent } from "$lib/server/document-api";
import { renderDocMarkdownToHtml } from "./doc-render.ts";

interface LoadEvent {
  params: { id: string };
  locals: App.Locals & { activeProjectId?: string | null };
  fetch: typeof fetch;
  request: Request;
  url: URL;
}

interface ActionEvent {
  params: { id: string };
  locals: App.Locals;
  fetch: typeof fetch;
  request: Request;
  url: URL;
}

interface PublicDocument {
  id: string;
  orgId?: string;
  org_id?: string;
  projectId?: string | null;
  project_id?: string | null;
  type?: string;
  docType?: string;
  title: string;
  bodyMd?: string;
  body_md?: string;
  frontmatter?: Record<string, unknown>;
  updatedAt?: string;
  updated_at?: string;
}

interface PublicBacklink {
  fromDocId?: string;
  from_doc_id?: string;
  id?: string;
  title?: string;
}

export const load = (event: LoadEvent) => ({
  activeProjectId: event.locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const { params } = event;
      const api = createDocumentApiForEvent(event);
      const doc = await api.docs.get({ id: params.id }).catch(mapDocumentNotFound) as PublicDocument;
      const body = doc.bodyMd ?? doc.body_md ?? "";
      const docResult = {
        doc: {
          id: doc.id,
          org_id: doc.orgId ?? doc.org_id ?? "",
          project_id: doc.projectId ?? doc.project_id ?? null,
          kind: doc.docType ?? doc.type ?? "note",
          title: doc.title,
          body,
          renderedHtml: renderDocMarkdownToHtml(body),
          frontmatter: doc.frontmatter ?? {},
          updated_at: doc.updatedAt ?? doc.updated_at ?? "",
        },
      };
      const backlinks = ((await api.docs.listBacklinks({ id: params.id })) as PublicBacklink[]).map((backlink) => ({
        id: backlink.fromDocId ?? backlink.from_doc_id ?? backlink.id ?? "",
        title: backlink.title,
        href: `/docs/${backlink.fromDocId ?? backlink.from_doc_id ?? backlink.id ?? ""}`,
      }));
      return { ...docResult, backlinks };
    })(),
  },
});

export const actions = {
  delete: async (event: ActionEvent) => {
    await createDocumentApiForEvent(event).docs.delete({ id: event.params.id! }).catch(mapDocumentNotFound);
    throw redirect(303, "/docs");
  },
};

function mapDocumentNotFound(errorValue: unknown): never {
  const message = errorValue instanceof Error ? errorValue.message : String(errorValue);
  if (/not found/i.test(message)) throw error(404, "Document not found");
  throw errorValue;
}

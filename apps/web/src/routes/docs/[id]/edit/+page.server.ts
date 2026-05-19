import { error, fail } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms/server";
import { valibot } from "sveltekit-superforms/adapters";
import { DocumentFormSchema } from "../../../../lib/server/documents.schema.ts";
import { parseLabels, serializeLabels } from "../../../../lib/markdown/labels.ts";
import { createDocumentApiForEvent } from "$lib/server/document-api";
import { requestAppScope } from "$lib/server/application-scope";

interface LoadEvent {
  params: { id: string };
  locals?: App.Locals;
  fetch?: typeof fetch;
  request?: Request;
  url?: URL;
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
  projectId?: string | null;
  project_id?: string | null;
  type?: string;
  docType?: string;
  title: string;
  bodyMd?: string;
  body_md?: string;
  frontmatter?: Record<string, unknown>;
}

function extractLabels(fm: Record<string, unknown>): string[] {
  const raw = (fm as { labels?: unknown }).labels;
  return Array.isArray(raw)
    ? (raw.filter((v): v is string => typeof v === "string") as string[])
    : [];
}

export const load = async (event: LoadEvent) => {
  const { params } = event;
  const serverUrl =
    process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? process.env["FULCRUM_API_URL"];

  let publicDoc: PublicDocument;
  if (serverUrl && event.url && event.request) {
    // HTTP path: delegate to document API (production mode).
    publicDoc = await createDocumentApiForEvent(event as Required<LoadEvent>).docs.get({ id: params.id }).catch(mapNotFound) as PublicDocument;
  } else {
    // Local/in-process path: query DB directly via application scope.
    const { em, ctx } = await requestAppScope(event.locals);
    const { getDoc } = await import("@knowledge-workspace/application/docs/queries.ts");
    const raw = await getDoc(em, ctx, params.id).catch(mapNotFound);
    if (!raw) throw mapNotFound(new Error("Document not found"));
    publicDoc = {
      id: raw.id,
      projectId: raw.projectId ?? null,
      docType: raw.docType,
      title: raw.title,
      bodyMd: raw.bodyMd ?? "",
      frontmatter: raw.frontmatter ?? {},
    };
  }

  const doc = toEditableDocument(publicDoc);
  const form = await superValidate(
    {
      title: doc.title,
      kind: doc.kind,
      labels: serializeLabels(extractLabels(doc.frontmatter)),
      body: doc.body,
      projectId: doc.project_id,
    },
    valibot(DocumentFormSchema),
  );
  return { doc, form };
};

export const actions = {
  default: async (event: ActionEvent) => {
    const { params, request } = event;
    const form = await superValidate(request, valibot(DocumentFormSchema));
    if (!form.valid) return fail(400, { form });
    await createDocumentApiForEvent(event).docs.update({
      id: params.id!,
      title: form.data.title,
      type: form.data.kind,
      bodyMd: form.data.body,
      frontmatter: {
        title: form.data.title,
        kind: form.data.kind,
        labels: parseLabels(form.data.labels ?? ""),
      },
    }).catch(mapNotFound);
    return { form };
  },
};

function mapNotFound(errorValue: unknown): never {
  const message = errorValue instanceof Error ? errorValue.message : String(errorValue);
  if (/not found|invalid input syntax for type uuid/i.test(message)) {
    throw error(404, "Document not found");
  }
  throw errorValue;
}

function toEditableDocument(doc: PublicDocument) {
  const body = doc.bodyMd ?? doc.body_md ?? "";
  const frontmatter = doc.frontmatter ?? {};
  return {
    id: doc.id,
    project_id: doc.projectId ?? doc.project_id ?? null,
    kind: typeof frontmatter.kind === "string" ? frontmatter.kind : doc.docType ?? doc.type ?? "note",
    title: doc.title,
    body,
    frontmatter,
  };
}

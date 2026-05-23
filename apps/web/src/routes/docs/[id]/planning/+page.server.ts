import { error, redirect } from "@sveltejs/kit";
import { createDocumentApiForEvent } from "$lib/server/document-api";

interface LoadEvent {
  params: { id: string };
  locals: App.Locals & { activeProjectId?: string | null };
  fetch: typeof fetch;
  url: URL;
}

export const load = async (event: LoadEvent) => {
  const api = createDocumentApiForEvent(event);
  const doc = await api.docs.get({ id: event.params.id }).catch(mapNotFound);
  const publicDoc = doc as { id: string; title?: string; bodyMd?: string; body_md?: string; projectId?: string; project_id?: string };

  return {
    doc: {
      id: publicDoc.id,
      title: publicDoc.title ?? "Untitled",
      bodyMd: publicDoc.bodyMd ?? publicDoc.body_md ?? "",
      projectId: publicDoc.projectId ?? publicDoc.project_id ?? event.locals.activeProjectId ?? null,
    },
  };
};

export const actions = {
  startPlanning: async (event: LoadEvent & { request: Request }) => {
    const form = await event.request.formData();
    const docId = event.params.id;
    const projectId = String(form.get("projectId") ?? "").trim() || null;

    throw redirect(303, projectId
      ? `/projects/${projectId}/planning?docContext=${docId}`
      : `/planning/sessions?docContext=${docId}`);
  },
};

function mapNotFound(errorValue: unknown): never {
  const message = errorValue instanceof Error ? errorValue.message : String(errorValue);
  if (/not found|invalid input syntax for type uuid|request failed with 404/i.test(message)) {
    throw error(404, "Document not found");
  }
  throw errorValue;
}

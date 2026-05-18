import { error, fail, redirect } from "@sveltejs/kit";
import { createDocumentApiForEvent } from "$lib/server/document-api";

interface LoadEvent {
  params: { id: string };
  locals: App.Locals;
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

interface Version {
  id: string;
  versionNum: number;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
  isRestoreOf: string | null;
}

export const load = async (event: LoadEvent) => {
  const api = createDocumentApiForEvent(event);
  const [doc, versions] = await Promise.all([
    api.docs.get({ id: event.params.id }).catch(mapNotFound) as Promise<{ id: string; title: string }>,
    api.docs.listVersions({ id: event.params.id }).catch(() => []) as Promise<Version[]>,
  ]);
  return {
    documentId: doc.id,
    title: doc.title,
    versions,
  };
};

export const actions = {
  diff: async (event: ActionEvent) => {
    const formData = await event.request.formData();
    const versionId = formData.get("versionId");
    if (!versionId || typeof versionId !== "string") {
      return fail(400, { error: "versionId is required" });
    }
    const api = createDocumentApiForEvent(event);
    const result = await api.docs.diffVersionById({
      id: event.params.id,
      versionId,
    }).catch(mapNotFound) as { html: string; hasDiff: boolean };
    return result;
  },
  restore: async (event: ActionEvent) => {
    const formData = await event.request.formData();
    const versionId = formData.get("versionId");
    if (!versionId || typeof versionId !== "string") {
      return fail(400, { error: "versionId is required" });
    }
    const api = createDocumentApiForEvent(event);
    await api.docs.restoreVersionById({
      id: event.params.id,
      versionId,
    }).catch(mapNotFound);
    redirect(303, `/docs/${event.params.id}/history`);
  },
};

function mapNotFound(errorValue: unknown): never {
  const message = errorValue instanceof Error ? errorValue.message : String(errorValue);
  if (/not found|invalid input syntax for type uuid|request failed with 404/i.test(message)) {
    throw error(404, "Document not found");
  }
  throw errorValue;
}

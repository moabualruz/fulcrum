import { error, fail, redirect } from "@sveltejs/kit";
import { createDocumentApiForEvent } from "$lib/server/document-api";
import { requestAppScope } from "$lib/server/application-scope";

interface LoadEvent {
  params: { id: string };
  url?: URL;
  locals?: App.Locals;
  request?: Request;
  fetch?: typeof fetch;
}

interface ActionEvent {
  params: { id: string };
  request: Request;
  locals: App.Locals;
  url: URL;
  fetch: typeof fetch;
}

interface DocumentPublicRow {
  id: string;
  title: string;
}

interface DocumentVersionPublicRow {
  id: string;
  version: number;
  title: string;
  bodyMd: string;
  createdAt: string | null;
}

interface DocumentVersionDiff {
  bodyMdBefore?: string;
  bodyMdAfter?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function diffHtml(fromBody: string, toBody: string): string {
  return `<del>${escapeHtml(fromBody)}</del><ins>${escapeHtml(toBody)}</ins>`;
}

export const load = async (event: LoadEvent) => {
  const serverUrl = process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"];
  const from = Number(event.url?.searchParams.get("from") ?? 0);
  const to = Number(event.url?.searchParams.get("to") ?? 0);

  if (serverUrl && event.url && event.request) {
    // HTTP path: delegate to document API (production mode).
    const api = createDocumentApiForEvent(event as Required<LoadEvent>);
    const doc = await api.docs.get({ id: event.params.id })
      .catch(() => { throw error(404, "Document not found"); }) as DocumentPublicRow;
    const versions = await api.docs.listVersions({ id: event.params.id }) as DocumentVersionPublicRow[];
    const diff = from > 0 && to > 0
      ? await api.docs.diffVersions({ id: event.params.id, fromVersion: from, toVersion: to })
        .catch(() => null) as DocumentVersionDiff | null
      : null;
    return {
      doc: { id: doc.id, title: doc.title },
      versions: versions.map((version) => ({
        ...version,
        versionNum: version.version,
        body: version.bodyMd,
        createdAt: version.createdAt,
        created_at: version.createdAt,
        isSnapshot: true,
      })),
      diffHtml: diff?.bodyMdBefore && diff?.bodyMdAfter ? diffHtml(diff.bodyMdBefore, diff.bodyMdAfter) : "",
    };
  }

  // Local/in-process path: query DB directly via application scope.
  const { em, ctx } = await requestAppScope(event.locals as Parameters<typeof requestAppScope>[0]);
  const { getDoc, listDocVersions, diffDocVersions } = await import("@knowledge-workspace/application/docs/queries.ts");
  const docRaw = await getDoc(em, ctx, event.params.id).catch(() => { throw error(404, "Document not found"); });
  if (!docRaw) throw error(404, "Document not found");

  const versionRows = await listDocVersions(em, ctx, event.params.id);
  let diffResult: string = "";
  if (from > 0 && to > 0) {
    const result = await diffDocVersions(em, ctx, event.params.id, from, to).catch(() => null);
    if (result?.html) diffResult = result.html;
  }

  return {
    doc: { id: docRaw.id, title: docRaw.title },
    versions: versionRows.map((version) => ({
      id: version.id,
      versionNum: version.versionNum,
      isSnapshot: version.isSnapshot,
      createdAt: version.createdAt instanceof Date ? version.createdAt.toISOString() : String(version.createdAt ?? ""),
    })),
    diffHtml: diffResult,
  };
};

export const actions = {
  restore: async (event: ActionEvent) => {
    const fd = await event.request.formData();
    const versionStr = fd.get("version") ?? fd.get("version_num");
    const version = Number(versionStr);
    if (!version || version < 1) return fail(400, { error: "Invalid version" });

    const serverUrl = process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"];
    if (serverUrl && event.url && event.request) {
      const api = createDocumentApiForEvent(event);
      await api.docs.restoreVersion({ id: event.params.id, version })
        .catch(() => { throw error(404, "Document version not found"); });
    } else {
      const { em, ctx } = await requestAppScope(event.locals as Parameters<typeof requestAppScope>[0]);
      const { DocumentService } = await import("@knowledge-workspace/application/document-service.ts");
      await new DocumentService(em).restoreVersion(
        { orgId: ctx.orgId, userId: ctx.userId ?? "" },
        event.params.id,
        version,
      ).catch(() => { throw error(404, "Document version not found"); });
    }
    throw redirect(303, `/docs/${event.params.id}`);
  },
};

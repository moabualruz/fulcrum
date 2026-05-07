import { error, fail, redirect } from "@sveltejs/kit";
import { getDoc } from "../../../../../../application/docs/queries.ts";
import {
  listDocumentVersions,
  restoreDocumentVersion,
  createDocumentVersion,
  getNextVersionNumber,
} from "../../../../../../application/docs/version-queries.ts";
import { requestAppScope } from "../../../../lib/server/application-scope.ts";

interface LoadEvent {
  params: { id: string };
  url: URL;
  locals: Parameters<typeof requestAppScope>[0];
}

interface ActionEvent {
  params: { id: string };
  request: Request;
  locals: Parameters<typeof requestAppScope>[0];
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

export const load = async ({ params, url, locals }: LoadEvent) => {
  const { em, ctx } = await requestAppScope(locals);
  const doc = await getDoc(em, ctx, params.id);
  if (!doc) throw error(404, "Document not found");
  const versions = await listDocumentVersions(em, params.id);
  const from = Number(url?.searchParams.get("from") ?? 0);
  const to = Number(url?.searchParams.get("to") ?? 0);
  const fromVersion = versions.find((version) => version.version === from);
  const toVersion = versions.find((version) => version.version === to);
  return {
    doc: { id: doc.id, title: doc.title },
    versions: versions.map((version) => ({
      ...version,
      versionNum: version.version,
      createdAt: version.created_at,
      isSnapshot: true,
    })),
    diffHtml: fromVersion && toVersion ? diffHtml(fromVersion.body, toVersion.body) : "",
  };
};

export const actions = {
  restore: async ({ params, request, locals }: ActionEvent) => {
    const fd = await request.formData();
    const versionStr = fd.get("version") ?? fd.get("version_num");
    const version = Number(versionStr);
    if (!version || version < 1) return fail(400, { error: "Invalid version" });
    const { em, ctx } = await requestAppScope(locals);
    const current = await getDoc(em, ctx, params.id);
    if (current) {
      const nextVer = await getNextVersionNumber(em, params.id);
      await createDocumentVersion(em, {
        docId: params.id,
        orgId: ctx.orgId,
        version: nextVer,
        title: current.title,
        body: current.bodyMd,
        frontmatter: current.frontmatter ?? {},
        author: "system",
      });
    }
    await restoreDocumentVersion(em, params.id, ctx.orgId, version);
    throw redirect(303, `/docs/${params.id}`);
  },
};

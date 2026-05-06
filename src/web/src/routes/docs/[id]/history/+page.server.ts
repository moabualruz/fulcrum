import { error, fail, redirect } from "@sveltejs/kit";
import { getEm, getDefaultOrgIdOrm } from "../../../../lib/server/em.ts";
import {
  listDocumentVersions,
  restoreDocumentVersion,
  createDocumentVersion,
  getNextVersionNumber,
} from "../../../../lib/server/doc-versions.ts";

interface LoadEvent {
  params: { id: string };
  url?: URL;
}

interface ActionEvent {
  params: { id: string };
  request: Request;
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

export const load = async ({ params, url }: LoadEvent) => {
  const em = await getEm();
  const orgId = await getDefaultOrgIdOrm(em);
  const rows = await em.getKysely<any>()
    .selectFrom("documents")
    .select(["id", "title"])
    .where("id", "=", params.id)
    .where("org_id", "=", orgId)
    .execute() as Array<{ id: string; title: string }>;
  if (rows.length === 0) throw error(404, "Document not found");
  const doc = rows[0]!;
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
  restore: async ({ params, request }: ActionEvent) => {
    const fd = await request.formData();
    const versionStr = fd.get("version") ?? fd.get("version_num");
    const version = Number(versionStr);
    if (!version || version < 1) return fail(400, { error: "Invalid version" });
    const em = await getEm();
    const orgId = await getDefaultOrgIdOrm(em);
    // Snapshot current state before restore
    const currentRows = await em.getKysely<any>()
      .selectFrom("documents")
      .select(["title", "body_md as body", "frontmatter"])
      .where("id", "=", params.id)
      .where("org_id", "=", orgId)
      .execute() as Array<{ title: string; body: string; frontmatter: Record<string, unknown> }>;
    if (currentRows.length > 0) {
      const cur = currentRows[0]!;
      const nextVer = await getNextVersionNumber(em, params.id);
      await createDocumentVersion(em, {
        docId: params.id,
        orgId,
        version: nextVer,
        title: cur.title,
        body: cur.body,
        frontmatter: cur.frontmatter ?? {},
        author: "system",
      });
    }
    await restoreDocumentVersion(em, params.id, orgId, version);
    throw redirect(303, `/docs/${params.id}`);
  },
};

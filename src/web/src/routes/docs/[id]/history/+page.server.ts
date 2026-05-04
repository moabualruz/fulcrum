import { error, fail, redirect } from "@sveltejs/kit";
import { openProductDb, getDefaultOrgId } from "@fulcrum/lib/server/db.ts";
import {
  listDocumentVersions,
  restoreDocumentVersion,
  createDocumentVersion,
  getNextVersionNumber,
} from "@fulcrum/lib/server/doc-versions.ts";

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
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    const rows = await db.query<{ id: string; title: string }>(
      `SELECT id, title FROM documents WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    if (rows.length === 0) throw error(404, "Document not found");
    const doc = rows[0]!;
    const versions = await listDocumentVersions(db, params.id);
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
  } finally {
    await db.close();
  }
};

export const actions = {
  restore: async ({ params, request }: ActionEvent) => {
    const fd = await request.formData();
    const versionStr = fd.get("version") ?? fd.get("version_num");
    const version = Number(versionStr);
    if (!version || version < 1) return fail(400, { error: "Invalid version" });
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      // Snapshot current state before restore
      const currentRows = await db.query<{ title: string; body: string; frontmatter: Record<string, unknown> }>(
        `SELECT title, body, frontmatter FROM documents WHERE id = $1 AND org_id = $2`,
        [params.id, orgId],
      );
      if (currentRows.length > 0) {
        const cur = currentRows[0]!;
        const nextVer = await getNextVersionNumber(db, params.id);
        await createDocumentVersion(db, {
          docId: params.id,
          orgId,
          version: nextVer,
          title: cur.title,
          body: cur.body,
          frontmatter: cur.frontmatter ?? {},
          author: "system",
        });
      }
      await restoreDocumentVersion(db, params.id, orgId, version);
    } finally {
      await db.close();
    }
    throw redirect(303, `/docs/${params.id}`);
  },
};

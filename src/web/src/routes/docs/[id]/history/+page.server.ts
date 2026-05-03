import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import {
  listDocumentVersions,
  restoreDocumentVersion,
  createDocumentVersion,
  getNextVersionNumber,
} from "$lib/server/doc-versions";

export const load: PageServerLoad = async ({ params }) => {
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
    return { doc: { id: doc.id, title: doc.title }, versions };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  restore: async ({ params, request }) => {
    const fd = await request.formData();
    const versionStr = fd.get("version");
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

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";
import { listTreeChildren } from "$lib/server/repo-files";

/** GET /api/repos/:id/tree?branch=main&parent=src */
export const GET: RequestHandler = async ({ params, url }) => {
  const branch = url.searchParams.get("branch") ?? "main";
  const parent = url.searchParams.get("parent"); // null = root

  const db = await openDatabase();
  try {
    const orgId = await getDefaultOrgId(db);
    // Verify repo belongs to org
    const repoRows = await db.query<{ id: string }>(
      `SELECT id FROM repos WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    if (repoRows.length === 0) {
      return json({ error: "repo not found" }, { status: 404 });
    }

    const children = await listTreeChildren(db, params.id!, branch, parent);
    return json({ children });
  } finally {
    await db.close();
  }
};

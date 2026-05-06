import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { openDatabase, getDefaultOrgId } from "../../../../../lib/server/db";

export const load: PageServerLoad = async ({ params }) => {
  const db = await openDatabase();
  try {
    const orgId = await getDefaultOrgId(db);
    const projRows = await db.query<{ id: string }>(
      `SELECT id FROM projects WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    if (projRows.length === 0) throw error(404, "Project not found");
    return { projectId: params.id };
  } finally {
    await db.close();
  }
};

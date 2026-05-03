import type { PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";
import { buildDocTree, type FlatDoc } from "$lib/server/doc-tree";

interface RawRow {
  id: string;
  title: string;
  kind: string;
  parent_id: string | null;
  sort_order: number;
  updated_at: string | Date;
}

export const load: PageServerLoad = async () => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    // Global docs = documents with no project_id
    const rows = await db.query<RawRow>(
      `SELECT id, title, kind, parent_id, sort_order, updated_at
         FROM documents
        WHERE org_id = $1 AND project_id IS NULL
        ORDER BY sort_order ASC, title ASC`,
      [orgId],
    );
    const flat: FlatDoc[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      parent_id: r.parent_id,
      sort_order: r.sort_order,
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    }));
    return { tree: buildDocTree(flat) };
  } finally {
    await db.close();
  }
};

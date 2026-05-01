import type { PageServerLoad } from "./$types";
import { openProductDb } from "$lib/server/db";
import { loadDashboard } from "$lib/server/dashboard";
import type { ProductDb } from "../../../product-kernel/db/types.ts";

async function getDefaultOrgId(db: ProductDb): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM orgs WHERE slug = $1`,
    ["default"],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("default org not found");
  return id;
}

export const load: PageServerLoad = ({ locals }) => {
  const projectId = locals?.activeProjectId ?? null;
  return {
    activeProjectId: projectId,
    streamed: {
      dashboard: (async () => {
        const db = await openProductDb();
        try {
          const orgId = await getDefaultOrgId(db);
          return await loadDashboard(db, orgId, projectId);
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

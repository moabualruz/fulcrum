import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openDatabase, getDefaultOrgId } from "../../../../../lib/server/db";
import {
  upsertProjectConnector,
  syncProjectConnector,
  listProjectConnectors,
} from "../../../../../lib/server/project-connectors";

export const load: PageServerLoad = async ({ params }) => {
  const db = await openDatabase();
  try {
    const orgId = await getDefaultOrgId(db);
    const projRows = await db.query<{ id: string }>(
      `SELECT id FROM projects WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    if (projRows.length === 0) throw error(404, "Project not found");
    const connectors = await listProjectConnectors(db, params.id);
    return { connectors, projectId: params.id };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  upsert: async ({ params, request }) => {
    const fd = await request.formData();
    const connectorType = (fd.get("connectorType") as string | null)?.trim();
    const enabled = fd.get("enabled") === "on";
    const configRaw = fd.get("config") as string | null;
    if (!connectorType) return fail(400, { error: "Connector type is required" });
    let config: Record<string, unknown> = {};
    if (configRaw) {
      try {
        config = JSON.parse(configRaw);
      } catch {
        return fail(400, { error: "Invalid config JSON" });
      }
    }
    const db = await openDatabase();
    try {
      const orgId = await getDefaultOrgId(db);
      await upsertProjectConnector(db, {
        orgId,
        projectId: params.id!,
        connectorType,
        enabled,
        config,
      });
    } finally {
      await db.close();
    }
    return { success: true };
  },
  sync: async ({ request }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const db = await openDatabase();
    try {
      await syncProjectConnector(db, id);
    } finally {
      await db.close();
    }
    return { success: true };
  },
};

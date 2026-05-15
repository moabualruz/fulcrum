import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  upsertProjectConnector,
  syncProjectConnector,
  listProjectConnectors,
} from "@integration-hub/application/project-connectors/commands.ts";
import { getProjectOrNull } from "@work-management/application/projects/queries.ts";
import { requestAppScope } from "$lib/server/application-scope";

export const load: PageServerLoad = async ({ params, locals }) => {
  const { em, ctx } = await requestAppScope(locals, params.id);
  const project = await getProjectOrNull(em, ctx, params.id);
  if (!project) throw error(404, "Project not found");
  const connectors = await listProjectConnectors(em, params.id);
  return { connectors, projectId: params.id };
};

export const actions: Actions = {
  upsert: async ({ params, request, locals }) => {
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
    const { em, ctx } = await requestAppScope(locals, params.id);
    await upsertProjectConnector(em, {
        orgId: ctx.orgId,
        projectId: params.id!,
        connectorType,
        enabled,
        config,
      });
    return { success: true };
  },
  sync: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const { em } = await requestAppScope(locals);
    await syncProjectConnector(em, id);
    return { success: true };
  },
};

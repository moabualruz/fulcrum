import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { ensureProjectExists } from "$lib/server/project-api";
import {
  upsertProjectConnector,
  syncProjectConnector,
  listProjectConnectors,
} from "@integration-hub/interface/project-connectors.ts";

export const load: PageServerLoad = async (event) => {
  const { params, locals } = event;
  await ensureProjectExists(event, params.id);
  const { em } = await requestScopedApp(locals, params.id);
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
    const { em, ctx } = await requestScopedApp(locals, params.id);
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
    const { em } = await requestScopedApp(locals);
    await syncProjectConnector(em, id);
    return { success: true };
  },
};

async function requestScopedApp(locals: App.Locals, projectId?: string) {
  const { requestAppScope } = await import("$lib/server/application-scope");
  return requestAppScope(locals, projectId);
}

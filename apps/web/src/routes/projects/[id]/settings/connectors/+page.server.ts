import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { createConnectorApiForEvent } from "$lib/server/connector-api";
import { ensureProjectExists } from "$lib/server/project-api";

export const load: PageServerLoad = async (event) => {
  const { params } = event;
  await ensureProjectExists(event, params.id);
  const connectors = await createConnectorApiForEvent(event).projectConnectors.list({
    projectId: params.id,
  });
  return { connectors, projectId: params.id };
};

export const actions: Actions = {
  upsert: async (event) => {
    const { params, request } = event;
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
    await createConnectorApiForEvent(event).projectConnectors.upsert({
      projectId: params.id,
      connectorType,
      enabled,
      config,
    });
    return { success: true };
  },
  sync: async (event) => {
    const fd = await event.request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    await createConnectorApiForEvent(event).projectConnectors.sync({ id });
    return { success: true };
  },
};

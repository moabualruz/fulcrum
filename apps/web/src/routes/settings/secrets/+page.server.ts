import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { createSettingsApiForEvent } from "$lib/server/settings-api";

function appFail(error: unknown) {
  const message = error instanceof Error ? error.message : "Settings secret request failed";
  return fail(500, { error: message });
}

export const load: PageServerLoad = (event) => {
  return {
    streamed: {
      data: (async () => {
        const api = createSettingsApiForEvent(event);
        return await api.settingsSecrets.list();
      })(),
    },
  };
};

export const actions: Actions = {
  add: async (event) => {
    const data = await event.request.formData();
    const name = (data.get("name") as string)?.trim();
    const value = (data.get("value") as string)?.trim();
    const provider = (data.get("provider") as string)?.trim() ?? "";
    if (!name || !value) return fail(400, { error: "name and value required" });
    try {
      const api = createSettingsApiForEvent(event);
      return await api.settingsSecrets.add({ name, value, provider });
    } catch (error) {
      return appFail(error);
    }
  },

  rotate: async (event) => {
    const data = await event.request.formData();
    const id = data.get("id") as string;
    const value = (data.get("value") as string)?.trim();
    if (!id || !value) return fail(400, { error: "id and value required" });
    try {
      const api = createSettingsApiForEvent(event);
      return await api.settingsSecrets.rotate({ id, value });
    } catch (error) {
      return appFail(error);
    }
  },

  archive: async (event) => {
    const data = await event.request.formData();
    const id = data.get("id") as string;
    if (!id) return fail(400, { error: "id required" });
    try {
      const api = createSettingsApiForEvent(event);
      return await api.settingsSecrets.archive({ id });
    } catch (error) {
      return appFail(error);
    }
  },

  delete: async (event) => {
    const data = await event.request.formData();
    const id = data.get("id") as string;
    if (!id) return fail(400, { error: "id required" });
    try {
      const api = createSettingsApiForEvent(event);
      return await api.settingsSecrets.delete({ id });
    } catch (error) {
      return appFail(error);
    }
  },
};

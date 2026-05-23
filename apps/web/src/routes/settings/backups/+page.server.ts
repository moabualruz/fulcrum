import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { createSettingsDataApiForEvent } from "$lib/server/settings-data-api";

class ValidationError extends Error {}

function appFail(error: unknown) {
  if (error instanceof ValidationError) return fail(400, { error: error.message });
  const message = error instanceof Error ? error.message : "Settings backup request failed";
  return fail(500, { error: message });
}

async function parseJsonFile(file: File | null): Promise<unknown> {
  if (!file || file.size === 0) throw new ValidationError("file required");
  try {
    return JSON.parse(await file.text());
  } catch (cause) {
    throw new ValidationError("invalid JSON", { cause });
  }
}

export const load: PageServerLoad = (event) => {
  return {
    streamed: {
      data: (async () => {
        const api = createSettingsDataApiForEvent(event);
        return await api.settingsBackups.list();
      })(),
    },
  };
};

export const actions: Actions = {
  create: async (event) => {
    try {
      const api = createSettingsDataApiForEvent(event);
      return await api.settingsBackups.create();
    } catch (error) {
      return appFail(error);
    }
  },

  restore: async (event) => {
    const data = await event.request.formData();
    try {
      const api = createSettingsDataApiForEvent(event);
      return await api.settingsBackups.preflight({ backupJson: await parseJsonFile(data.get("file") as File | null) });
    } catch (error) {
      return appFail(error);
    }
  },

  confirmRestore: async (event) => {
    const data = await event.request.formData();
    const counts = data.get("entityCounts") as string;
    if (!counts) return fail(400, { error: "missing entity counts" });
    try {
      const backupJson = data.get("backupJson");
      const parsed = typeof backupJson === "string" && backupJson ? JSON.parse(backupJson) : null;
      const api = createSettingsDataApiForEvent(event);
      return await api.settingsBackups.restore({ backupJson: parsed });
    } catch (error) {
      return appFail(error);
    }
  },
};

import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { createSettingsDataApiForEvent } from "$lib/server/settings-data-api";

const SETTINGS_ENTITY_KINDS = ["projects", "tasks", "credentials", "feature_flags", "tenant_settings"] as const;
type SettingsEntityKind = (typeof SETTINGS_ENTITY_KINDS)[number];

class ValidationError extends Error {}

function appFail(error: unknown) {
  if (error instanceof ValidationError) return fail(400, { error: error.message });
  const message = error instanceof Error ? error.message : "Settings data request failed";
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

export const load: PageServerLoad = () => {
  return { entityKinds: SETTINGS_ENTITY_KINDS };
};

export const actions: Actions = {
  export: async (event) => {
    const form = await event.request.formData();
    const kinds = form.getAll("kinds").filter((kind): kind is SettingsEntityKind =>
      typeof kind === "string" && (SETTINGS_ENTITY_KINDS as readonly string[]).includes(kind)
    );
    try {
      const api = createSettingsDataApiForEvent(event);
      const result = await api.settingsData.export({ kinds });
      return { exported: true, data: JSON.stringify(result, null, 2), filename: `fulcrum-export-${Date.now()}.json` };
    } catch (error) {
      return appFail(error);
    }
  },

  preflight: async (event) => {
    const form = await event.request.formData();
    try {
      const api = createSettingsDataApiForEvent(event);
      return await api.settingsData.preflightImport({ data: await parseJsonFile(form.get("file") as File | null) });
    } catch (error) {
      return appFail(error);
    }
  },

  import: async (event) => {
    const form = await event.request.formData();
    try {
      const parsed = await parseJsonFile(form.get("file") as File | null);
      const api = createSettingsDataApiForEvent(event);
      return await api.settingsData.import({ data: parsed });
    } catch (error) {
      return appFail(error);
    }
  },
};

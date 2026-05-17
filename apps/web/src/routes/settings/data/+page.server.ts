import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { requestServiceScope } from "$lib/server/request-service-scope";
import { importSettingsData, preflightSettingsDataImport } from "@platform-core/interface/settings-workbench.ts";
import { createSettingsDataExport, SETTINGS_ENTITY_KINDS, type SettingsEntityKind } from "@platform-core/interface/settings-workbench.ts";
import { AppError } from "@platform-core/domain/errors.ts";

function appFail(error: unknown) {
  if (error instanceof AppError) return fail(error.kind === "validation" ? 400 : 500, { error: error.message });
  throw error;
}

async function parseJsonFile(file: File | null): Promise<unknown> {
  if (!file || file.size === 0) throw new AppError("validation", "file required");
  try {
    return JSON.parse(await file.text());
  } catch (cause) {
    throw new AppError("validation", "invalid JSON", { cause });
  }
}

export const load: PageServerLoad = () => {
  return { entityKinds: SETTINGS_ENTITY_KINDS };
};

export const actions: Actions = {
  export: async ({ request, locals }) => {
    const form = await request.formData();
    const kinds = form.getAll("kinds").filter((kind): kind is SettingsEntityKind =>
      typeof kind === "string" && (SETTINGS_ENTITY_KINDS as readonly string[]).includes(kind)
    );
    try {
      const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
      const result = await createSettingsDataExport(em, ctx, { kinds });
      return { exported: true, data: JSON.stringify(result, null, 2), filename: `fulcrum-export-${Date.now()}.json` };
    } catch (error) {
      return appFail(error);
    }
  },

  preflight: async ({ request }) => {
    const form = await request.formData();
    try {
      return preflightSettingsDataImport(await parseJsonFile(form.get("file") as File | null));
    } catch (error) {
      return appFail(error);
    }
  },

  import: async ({ request, locals }) => {
    const form = await request.formData();
    try {
      const parsed = await parseJsonFile(form.get("file") as File | null);
      const { em, ctx } = await requestServiceScope(locals, locals?.activeProjectId ?? null);
      return await importSettingsData(em, ctx, parsed);
    } catch (error) {
      return appFail(error);
    }
  },
};

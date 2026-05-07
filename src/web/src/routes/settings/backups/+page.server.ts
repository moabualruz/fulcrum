import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { requestAppScope } from "$lib/server/application-scope";
import { createSettingsBackup, preflightSettingsBackup, restoreSettingsBackup } from "../../../../../application/settings/commands.ts";
import { listBackupSummaries, summarizeImportManifest } from "../../../../../application/settings/queries.ts";
import { AppError } from "../../../../../application/errors.ts";

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

export const load: PageServerLoad = ({ locals }) => {
  return {
    streamed: {
      data: (async () => {
        const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
        return listBackupSummaries(em, ctx);
      })(),
    },
  };
};

export const actions: Actions = {
  create: async ({ locals }) => {
    try {
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      return await createSettingsBackup(em, ctx);
    } catch (error) {
      return appFail(error);
    }
  },

  restore: async ({ request }) => {
    const data = await request.formData();
    try {
      return preflightSettingsBackup(await parseJsonFile(data.get("file") as File | null));
    } catch (error) {
      return appFail(error);
    }
  },

  confirmRestore: async ({ request, locals }) => {
    const data = await request.formData();
    const counts = data.get("entityCounts") as string;
    if (!counts) return fail(400, { error: "missing entity counts" });
    try {
      const backupJson = data.get("backupJson");
      const parsed = typeof backupJson === "string" && backupJson ? JSON.parse(backupJson) : null;
      const { manifest } = summarizeImportManifest(parsed);
      const { em, ctx } = await requestAppScope(locals, locals?.activeProjectId ?? null);
      return await restoreSettingsBackup(em, ctx, { manifest });
    } catch (error) {
      return appFail(error);
    }
  },
};

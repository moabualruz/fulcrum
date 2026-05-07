/**
 * /settings/importers — gated import wizard (CSV, Linear, Jira, Plane).
 *
 * Gated by FULCRUM_FEATURES (C1, default OFF).
 * Per-format flags:
 *   - import-csv
 *   - import-linear
 *   - import-jira
 *   - import-plane
 *
 * Flag OFF → tab hidden. Flag ON → wizard: connect/upload → field mapper → dry-run → confirm import.
 */

import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  IMPORTER_NAMES,
  isImporterEnabled,
  listImportHistory,
  listImporters,
  preflightImporter,
  runImporter,
  type ImporterName,
} from "@/application/importers/web-actions.ts";
import { AppInvariantError, AppValidationError } from "@/application/errors.ts";

export { isImporterEnabled as _isImporterEnabled, listImportHistory as _listImportHistory };

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session) throw redirect(302, "/auth/login");

  return {
    importers: listImporters(),
    importHistory: listImportHistory(),
  };
};

export const actions: Actions = {
  /** Dry-run / preflight: parse uploaded CSV or validate API key and return row count estimate. */
  preflight: async ({ locals, request }) => {
    if (!locals.session) throw redirect(302, "/auth/login");

    const form = await request.formData();
    const importerName = String(form.get("importerName") ?? "").trim() as ImporterName;

    if (!IMPORTER_NAMES.includes(importerName)) return fail(400, { preflightError: "Unknown importer" });
    if (!isImporterEnabled(importerName)) throw error(403, `import-${importerName} feature not enabled`);

    try {
      if (importerName === "csv") {
        const file = form.get("file");
        if (!(file instanceof File)) return fail(400, { preflightError: "File is required", importerName });
        return await preflightImporter({ importerName, file });
      }
      const apiKey = stringField(form, "apiKey").trim();
      return await preflightImporter({
        importerName,
        apiKey,
      });
    } catch (errorValue) {
      return mapImporterError(errorValue, "preflightError", importerName);
    }
  },

  /** Confirm import after preflight. */
  import: async ({ locals, request }) => {
    if (!locals.session) throw redirect(302, "/auth/login");

    const form = await request.formData();
    const importerName = String(form.get("importerName") ?? "").trim() as ImporterName;
    if (!IMPORTER_NAMES.includes(importerName)) return fail(400, { importError: "Unknown importer" });
    if (!isImporterEnabled(importerName)) throw error(403, `import-${importerName} feature not enabled`);

    try {
      await runImporter();
    } catch (errorValue) {
      return mapImporterError(errorValue, "importError", importerName);
    }
  },
};

function mapImporterError(errorValue: unknown, key: "preflightError" | "importError", importerName: ImporterName) {
  const message = errorValue instanceof Error ? errorValue.message : String(errorValue);
  if (errorValue instanceof AppValidationError) return fail(400, { [key]: message, importerName });
  if (errorValue instanceof AppInvariantError) return fail(501, { [key]: message, importerName });
  throw errorValue;
}

function stringField(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

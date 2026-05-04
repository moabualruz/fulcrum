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

export type ImporterName = "csv" | "linear" | "jira" | "plane";

export interface ImporterColumnMapping {
  source: string;
  target: string;
}

export interface ImportResult {
  id: string;
  importerName: ImporterName;
  importedAt: string;
  rowCount: number;
  status: "success" | "failure";
  message: string;
}

/** In-memory stub store (replaced by DB in production). */
const _importHistory: ImportResult[] = [];

function getFeatures(): string[] {
  return (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim()).filter(Boolean);
}

function isImporterEnabled(name: ImporterName): boolean {
  return getFeatures().includes(`import-${name}`);
}

function getImportHistory(): ImportResult[] {
  return _importHistory;
}

function addImportResult(result: ImportResult): void {
  _importHistory.push(result);
}

const IMPORTER_NAMES: ImporterName[] = ["csv", "linear", "jira", "plane"];

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session) throw redirect(302, "/auth/login");

  const importers = IMPORTER_NAMES.map((name) => ({
    name,
    enabled: isImporterEnabled(name),
  }));

  return {
    importers,
    importHistory: getImportHistory(),
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

    if (importerName === "csv") {
      const file = form.get("file") as File | null;
      if (!file || file.size === 0) return fail(400, { preflightError: "File is required", importerName });

      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      const headerLine = lines[0] ?? "";
      const columns = headerLine.split(",").map((c) => c.trim());
      const rowCount = Math.max(0, lines.length - 1); // exclude header

      return { preflightOk: true, importerName, rowCount, columns };
    }

    // Linear / Jira / Plane: validate API key
    const apiKey = String(form.get("apiKey") ?? "").trim();
    if (!apiKey) return fail(400, { preflightError: "API key is required", importerName });

    // Stub: pretend we fetched 10 items
    return { preflightOk: true, importerName, rowCount: 10, columns: ["title", "description", "status", "assignee"] };
  },

  /** Confirm import after preflight. */
  import: async ({ locals, request }) => {
    if (!locals.session) throw redirect(302, "/auth/login");

    const form = await request.formData();
    const importerName = String(form.get("importerName") ?? "").trim() as ImporterName;
    const rowCountStr = String(form.get("rowCount") ?? "0");
    const rowCount = parseInt(rowCountStr, 10);

    if (!IMPORTER_NAMES.includes(importerName)) return fail(400, { importError: "Unknown importer" });
    if (!isImporterEnabled(importerName)) throw error(403, `import-${importerName} feature not enabled`);

    const result: ImportResult = {
      id: crypto.randomUUID(),
      importerName,
      importedAt: new Date().toISOString(),
      rowCount: isNaN(rowCount) ? 0 : rowCount,
      status: "success",
      message: `Imported ${rowCount} tasks from ${importerName}`,
    };
    addImportResult(result);

    return { importOk: true, importerName, rowCount: result.rowCount, resultId: result.id };
  },
};

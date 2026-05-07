// POST /api/data/import-csv
// Accepts multipart/form-data with fields: file (CSV), columnMap (JSON string).
// Gated behind FULCRUM_FEATURES=import-csv.

import type { RequestHandler } from "@sveltejs/kit";
import { requestAppScope } from "$lib/server/application-scope";
import { isFeatureEnabled } from "@/data/features.ts";
import { importTasksFromCsvUpload } from "@/application/tasks/csv.ts";

function jsonError(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!isFeatureEnabled("import-csv")) {
    return jsonError("Feature import-csv not enabled", 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Invalid form data");
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return jsonError("field 'file' must be a file upload");
  }

  const columnMapRaw = formData.get("columnMap");
  if (!columnMapRaw || typeof columnMapRaw !== "string") {
    return jsonError("field 'columnMap' required (JSON string)");
  }

  let columnMap: Record<string, string>;
  try {
    columnMap = JSON.parse(columnMapRaw) as Record<string, string>;
  } catch {
    return jsonError("columnMap is not valid JSON");
  }

  try {
    const { em, ctx } = await requestAppScope(locals);
    const result = await importTasksFromCsvUpload(em, ctx, {
      bytes: await file.arrayBuffer(),
      columnMap,
    });

    return new Response(
      JSON.stringify(result),
      { headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    return jsonError((err as Error).message);
  }
};

// GET /api/data/export-csv?entity=tasks
// Gated behind FULCRUM_FEATURES=export-csv.

import type { RequestHandler } from "@sveltejs/kit";
import { requestAppScope } from "$lib/server/application-scope";
import { isFeatureEnabled } from "../../../../../../data/features.ts";
import { exportTasksCsvForContext } from "../../../../../../application/tasks/csv.ts";

function jsonError(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!isFeatureEnabled("export-csv")) {
    return jsonError("Feature export-csv not enabled", 403);
  }

  const entity = url.searchParams.get("entity") ?? "tasks";
  if (entity !== "tasks") {
    return jsonError(`Unknown entity: ${entity}`);
  }

  const { em, ctx } = await requestAppScope(locals);
  const result = await exportTasksCsvForContext(em, ctx);

  return new Response(result.bytes, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${entity}.csv"`,
      "x-entity-count": String(result.entityCount),
    },
  });
};

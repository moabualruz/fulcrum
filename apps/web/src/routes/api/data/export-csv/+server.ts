// GET /api/data/export-csv?entity=tasks
// Gated behind FULCRUM_FEATURES=export-csv.

import type { RequestHandler } from "@sveltejs/kit";
import { isDataExchangeFeatureEnabled } from "@integration-hub/interface/data-exchange-features.ts";
import { exportTasksCsvForContext } from "@work-management/interface/task-csv.ts";

function jsonError(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!isDataExchangeFeatureEnabled("export-csv")) {
    return jsonError("Feature export-csv not enabled", 403);
  }

  const entity = url.searchParams.get("entity") ?? "tasks";
  if (entity !== "tasks") {
    return jsonError(`Unknown entity: ${entity}`);
  }

  const { em, ctx } = await requestScopedApp(locals);
  const result = await exportTasksCsvForContext(em, ctx);

  return new Response(result.bytes, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${entity}.csv"`,
      "x-entity-count": String(result.entityCount),
    },
  });
};

async function requestScopedApp(locals: App.Locals) {
  const { requestServiceScope } = await import("$lib/server/request-service-scope");
  return requestServiceScope(locals);
}

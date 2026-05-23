// GET /api/data/export-csv?entity=tasks
// Gated behind FULCRUM_FEATURES=export-csv.

import type { RequestHandler } from "@sveltejs/kit";
import { isDataExchangeFeatureEnabled } from "@integration-hub/interface/data-exchange-features.ts";

function jsonError(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const GET: RequestHandler = async ({ url }) => {
  if (!isDataExchangeFeatureEnabled("export-csv")) {
    return jsonError("Feature export-csv not enabled", 403);
  }

  const entity = url.searchParams.get("entity") ?? "tasks";
  if (entity !== "tasks") {
    return jsonError(`Unknown entity: ${entity}`);
  }

  return jsonError("CSV export moved to the public data-portability API", 410);
};

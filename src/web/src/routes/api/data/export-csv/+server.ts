// GET /api/data/export-csv?entity=tasks
// Gated behind FULCRUM_FEATURES=export-csv.

import type { RequestHandler } from "@sveltejs/kit";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { openProductDb } from "$lib/server/db";
import { isFeatureEnabled } from "../../../../../../data/features.ts";
import { exportTasksToCsv } from "../../../../../../data/csv-export.ts";
import type { TaskRow } from "../../../../../../product-kernel/store/repositories.ts";

function jsonError(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const GET: RequestHandler = async ({ url }) => {
  if (!isFeatureEnabled("export-csv")) {
    return jsonError("Feature export-csv not enabled", 403);
  }

  const entity = url.searchParams.get("entity") ?? "tasks";
  if (entity !== "tasks") {
    return jsonError(`Unknown entity: ${entity}`);
  }

  const db = await openProductDb();
  const rows = await db.query<TaskRow>(`SELECT * FROM tasks ORDER BY created_at`);
  await db.close();

  // Write to tmp file then stream back
  const dir = await mkdtemp(join(tmpdir(), "fulcrum-export-"));
  const outPath = join(dir, "tasks.csv");
  try {
    const result = await exportTasksToCsv(rows, outPath);
    const bytes = await Bun.file(outPath).arrayBuffer();
    await rm(dir, { recursive: true, force: true });

    return new Response(bytes, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${entity}.csv"`,
        "x-entity-count": String(result.entity_count),
      },
    });
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
};

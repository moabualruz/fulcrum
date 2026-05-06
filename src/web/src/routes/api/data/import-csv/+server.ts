// POST /api/data/import-csv
// Accepts multipart/form-data with fields: file (CSV), columnMap (JSON string).
// Gated behind FULCRUM_FEATURES=import-csv.

import type { RequestHandler } from "@sveltejs/kit";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { getEm, getDefaultOrgIdOrm } from "$lib/server/em";
import { isFeatureEnabled } from "../../../../../../data/features.ts";
import { importCsv } from "../../../../../../data/csv-import.ts";
import { createTask } from "../../../../../../application/tasks/commands.ts";

function jsonError(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: RequestHandler = async ({ request }) => {
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

  // Write upload to tmp file
  const dir = await mkdtemp(join(tmpdir(), "fulcrum-import-"));
  const csvPath = join(dir, "upload.csv");
  try {
    const bytes = await file.arrayBuffer();
    await writeFile(csvPath, Buffer.from(bytes));

    let parsed;
    try {
      parsed = await importCsv(csvPath, columnMap, { dryRun: false });
    } catch (err) {
      await rm(dir, { recursive: true, force: true });
      return jsonError((err as Error).message);
    }

    const em = await getEm();
    const orgId = await getDefaultOrgIdOrm(em);

    let written = 0;
    for (const record of parsed.records) {
      await createTask(em, { orgId, userId: null }, {
        title: record["title"] as string,
        status: record["status"] ?? "pending",
        description: record["description"] ?? null,
        priority: record["priority"] ? Number(record["priority"]) : 0,
      });
      written++;
    }

    await rm(dir, { recursive: true, force: true });

    return new Response(
      JSON.stringify({
        total: parsed.total,
        written,
        skipped: parsed.skipped,
        skipped_records: parsed.skipped_records,
      }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }
};

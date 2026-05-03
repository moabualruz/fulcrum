// POST /api/data/import-csv
// Accepts multipart/form-data with fields: file (CSV), columnMap (JSON string).
// Gated behind FULCRUM_FEATURES=import-csv.

import type { RequestHandler } from "@sveltejs/kit";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isFeatureEnabled } from "../../../../../../data/features.ts";
import { importCsv } from "../../../../../../data/csv-import.ts";
import { openPglite } from "../../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../../product-kernel/db/migrate.ts";
import { productDbDir } from "../../../../../../product-kernel/paths.ts";
import {
  createLocalOrg,
  createTask,
} from "../../../../../../product-kernel/store/repositories.ts";

const DEFAULT_ORG_SLUG = "default";
const DEFAULT_ORG_NAME = "Local";

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

    // Write valid records to DB
    const dbDir = productDbDir();
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);

    const existingOrg = await db.query<{ id: string }>(
      `SELECT id FROM orgs WHERE slug = $1`,
      [DEFAULT_ORG_SLUG],
    );
    let orgId: string;
    if (existingOrg[0]) {
      orgId = existingOrg[0].id;
    } else {
      const org = await createLocalOrg(db, {
        slug: DEFAULT_ORG_SLUG,
        name: DEFAULT_ORG_NAME,
      });
      orgId = org.id;
    }

    let written = 0;
    for (const record of parsed.records) {
      await createTask(db, {
        orgId,
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

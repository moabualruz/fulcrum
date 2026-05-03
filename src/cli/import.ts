// fulcrum import — gated behind FULCRUM_FEATURES.
//
// Usage:
//   fulcrum import --input <path> --format csv --column-map <json> [--dry-run] [--json]
//   fulcrum import --format linear --project <teamId> [--dry-run] [--json]
//   fulcrum import --format jira --project <projectKey> [--dry-run] [--json]
//   fulcrum import --format plane --project <projectId> --workspace <slug> [--dry-run] [--json]

import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { assertFeatureEnabled } from "../data/features.ts";
import { importCsv } from "../data/csv-import.ts";
import { runImport, formatImportResult } from "./import-pm.ts";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import { productDbDir } from "../product-kernel/paths.ts";
import {
  createLocalOrg,
  createTask,
} from "../product-kernel/store/repositories.ts";

const HELP = `fulcrum import — import entities from file

Usage:
  fulcrum import --input <path> --format csv --column-map <json> [--dry-run] [--json]

Flags:
  --input <path>       Input file path.
  --format <fmt>       Import format. Currently: csv.
  --column-map <json>  JSON object mapping CSV headers → Fulcrum fields.
                       Example: '{"Title":"title","Status":"status"}'
  --dry-run            Parse and validate only; do not write to DB.
  --json               Print result as JSON.

Environment:
  FULCRUM_FEATURES  Must include "import-csv" to use --format csv.
`;

const DEFAULT_ORG_SLUG = "default";
const DEFAULT_ORG_NAME = "Local";

export async function run(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  // Parse args
  let format: string | undefined;
  let inputPath: string | undefined;
  let columnMapRaw: string | undefined;
  let dryRun = false;
  let jsonMode = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--format" && args[i + 1]) { format = args[++i]; }
    else if (a === "--input" && args[i + 1]) { inputPath = args[++i]; }
    else if (a === "--column-map" && args[i + 1]) { columnMapRaw = args[++i]; }
    else if (a === "--dry-run") { dryRun = true; }
    else if (a === "--json") { jsonMode = true; }
  }

  let projectId: string | undefined;
  let workspace: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--project" && args[i + 1]) { projectId = args[++i]; }
    else if (a === "--workspace" && args[i + 1]) { workspace = args[++i]; }
  }

  if (!format) {
    console.error("fulcrum import: --format required");
    process.exit(1);
  }

  // PM tool imports (linear / jira / plane)
  if (format === "linear" || format === "jira" || format === "plane") {
    if (!projectId) {
      console.error("fulcrum import: --project required");
      process.exit(1);
    }
    try {
      // Use a no-op credential repo and fetch client in CLI context
      // (real impl would wire CredentialRepository from product kernel)
      const { NullCredentialRepository, FetchHttpClient } = await import("./import-pm.ts");
      const result = await runImport({
        format,
        project: projectId,
        dryRun,
        json: jsonMode,
        credentials: new NullCredentialRepository(),
        http: new FetchHttpClient(),
        workspace,
      });
      console.log(formatImportResult(result, jsonMode));
    } catch (err) {
      console.error(`fulcrum import: ${(err as Error).message}`);
      process.exit(1);
    }
    return;
  }

  if (format === "csv") {
    try {
      assertFeatureEnabled("import-csv");
    } catch {
      console.error("Feature import-csv not enabled");
      process.exit(1);
    }

    if (!inputPath) {
      console.error("fulcrum import: --input required");
      process.exit(1);
    }

    if (!columnMapRaw) {
      console.error("fulcrum import: --column-map required");
      process.exit(1);
    }

    let columnMap: Record<string, string>;
    try {
      columnMap = JSON.parse(columnMapRaw) as Record<string, string>;
    } catch {
      console.error("fulcrum import: --column-map must be valid JSON");
      process.exit(1);
    }

    let parseResult;
    try {
      parseResult = await importCsv(inputPath, columnMap, { dryRun: true });
    } catch (err) {
      console.error(`fulcrum import: ${(err as Error).message}`);
      process.exit(1);
    }

    if (!dryRun && parseResult.records.length > 0) {
      // Write to product DB
      const dbDir = productDbDir();
      await mkdir(dbDir, { recursive: true });
      const db = await openPglite(join(dbDir, "main"));
      await runMigrations(db);

      // Ensure local org exists
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
      for (const record of parseResult.records) {
        await createTask(db, {
          orgId,
          title: record["title"] as string,
          status: record["status"] ?? "pending",
          description: record["description"] ?? null,
          priority: record["priority"] ? Number(record["priority"]) : 0,
        });
        written++;
      }
      parseResult = { ...parseResult, written };
    }

    const output = {
      total: parseResult.total,
      written: dryRun ? 0 : parseResult.written,
      skipped: parseResult.skipped,
      skipped_records: parseResult.skipped_records,
    };

    if (jsonMode) {
      console.log(JSON.stringify(output));
    } else if (dryRun) {
      console.log(`[dry-run] Would import ${parseResult.total - parseResult.skipped} records (${parseResult.skipped} skipped).`);
      if (parseResult.skipped_records.length > 0) {
        for (const s of parseResult.skipped_records) {
          console.log(`  record ${s.record}: ${s.reason}`);
        }
      }
    } else {
      console.log(`Imported ${output.written} records (${output.skipped} skipped).`);
    }
  } else {
    console.error(`fulcrum import: unknown format '${format}'`);
    process.exit(1);
  }
}

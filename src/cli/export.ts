// fulcrum export — gated behind FULCRUM_FEATURES=export-csv.
//
// Usage:
//   fulcrum export --format csv --entity tasks [--output <path>] [--json]

import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { assertFeatureEnabled } from "../data/features.ts";
import { exportTasksToCsv } from "../data/csv-export.ts";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import { productDbDir } from "../product-kernel/paths.ts";
import type { TaskRow } from "../product-kernel/store/repositories.ts";

const HELP = `fulcrum export — export entities to file

Usage:
  fulcrum export --format csv --entity tasks [--output <path>] [--json]

Flags:
  --format <fmt>    Export format. Currently: csv.
  --entity <name>   Entity type: tasks.
  --output <path>   Output file path. Defaults to ./<entity>.<format> in cwd.
  --json            Print result as JSON.

Environment:
  FULCRUM_FEATURES  Must include "export-csv" to use --format csv.
`;

export async function run(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  // Parse args
  let format: string | undefined;
  let entity: string | undefined;
  let output: string | undefined;
  let jsonMode = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--format" && args[i + 1]) { format = args[++i]; }
    else if (a === "--entity" && args[i + 1]) { entity = args[++i]; }
    else if (a === "--output" && args[i + 1]) { output = args[++i]; }
    else if (a === "--json") { jsonMode = true; }
  }

  if (!format) {
    console.error("fulcrum export: --format required");
    process.exit(1);
  }

  if (format === "csv") {
    try {
      assertFeatureEnabled("export-csv");
    } catch {
      console.error("Feature export-csv not enabled");
      process.exit(1);
    }

    if (!entity) {
      console.error("fulcrum export: --entity required");
      process.exit(1);
    }

    const outPath = output ?? join(process.cwd(), `${entity}.csv`);

    // Open product DB and fetch entities
    const dbDir = productDbDir();
    await mkdir(dbDir, { recursive: true });
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);

    if (entity === "tasks") {
      const rows = await db.query<TaskRow>(`SELECT * FROM tasks ORDER BY created_at`);
      const result = await exportTasksToCsv(rows, outPath);

      if (jsonMode) {
        console.log(JSON.stringify(result));
      } else {
        console.log(`Exported ${result.entity_count} tasks → ${result.path}`);
      }
    } else {
      console.error(`fulcrum export: unknown entity '${entity}'`);
      process.exit(1);
    }
  } else {
    console.error(`fulcrum export: unknown format '${format}'`);
    process.exit(1);
  }
}

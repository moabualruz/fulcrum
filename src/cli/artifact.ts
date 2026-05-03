import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import { productDbDir } from "../product-kernel/paths.ts";
import type { ProductDb } from "../product-kernel/db/types.ts";
import { listArtifacts, readArtifactDetail } from "../web/src/lib/server/artifacts.ts";

const HELP = `fulcrum artifact — artifact commands

Usage:
  fulcrum artifact list [--json]
`;

async function openProductDb(): Promise<ProductDb> {
  const dir = productDbDir();
  await mkdir(dir, { recursive: true });
  const db = await openPglite(join(dir, "main"));
  await runMigrations(db);
  return db;
}

export async function run(argv: readonly string[]): Promise<void> {
  const [verb, ...rest] = argv;
  if (!verb || verb === "help" || verb === "--help" || verb === "-h") {
    console.log(HELP);
    return;
  }
  if (verb !== "list") {
    console.error(`fulcrum artifact: unknown verb '${verb}'`);
    process.exit(2);
  }
  const json = rest.includes("--json");
  const db = await openProductDb();
  try {
    const orgRows = await db.query<{ id: string }>(`SELECT id FROM orgs WHERE slug = $1`, ["default"]);
    const orgId = orgRows[0]?.id;
    if (!orgId) {
      if (json) console.log("[]");
      else console.log("no artifacts");
      return;
    }
    const rows = await listArtifacts(db, orgId);
    if (json) {
      const withPreview = await Promise.all(rows.map(async (row) => {
        const detail = await readArtifactDetail(db, { orgId, id: row.id });
        return { ...row, preview: detail?.content ?? undefined };
      }));
      console.log(JSON.stringify(withPreview, null, 2));
    }
    else if (rows.length === 0) console.log("no artifacts");
    else for (const a of rows) console.log(`${a.kind}\t${a.title}\t${a.id}`);
  } finally {
    await db.close();
  }
}

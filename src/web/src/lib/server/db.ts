import { join } from "node:path";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { productDbDir } from "../../../../product-kernel/paths.ts";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";

/**
 * Open the live product DB rooted at `${FULCRUM_HOME}/state/product/db/main`
 * and ensure the schema is migrated. Caller owns `db.close()`.
 */
export async function openProductDb(): Promise<ProductDb> {
  const db = await openPglite(join(productDbDir(), "main"));
  await runMigrations(db);
  return db;
}

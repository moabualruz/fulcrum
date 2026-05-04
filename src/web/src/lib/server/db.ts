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
  await ensureDefaultOrg(db);
  return db;
}

async function ensureDefaultOrg(db: ProductDb): Promise<void> {
  const rows = await db.query<{ id: string }>("SELECT id FROM orgs WHERE slug = $1", ["default"]);
  if (rows.length === 0) {
    const id = crypto.randomUUID();
    await db.query(
      "INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3)",
      [id, "default", "Local"],
    );
  }
}

/**
 * Resolve the default org id (slug='default'). Throws when no org row
 * exists — callers should treat that as a hard error since every load
 * path requires an org for tenancy scoping.
 */
export async function getDefaultOrgId(db: ProductDb): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM orgs WHERE slug = $1`,
    ["default"],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("default org not found — run `fulcrum product init`");
  return id;
}

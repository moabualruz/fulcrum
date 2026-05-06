import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SqlExecutor } from "./sql.ts";

const MIGRATIONS_DIR = new URL("../product-kernel/db/migrations/", import.meta.url).pathname;

export async function applyProductMigrations(db: SqlExecutor): Promise<readonly string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const applied: string[] = [];
  for (const name of files) {
    const rows = await db.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [name],
    );
    if (rows.length > 0) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, name), "utf8");
    await db.exec(sql);
    await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    applied.push(name);
  }
  return applied;
}

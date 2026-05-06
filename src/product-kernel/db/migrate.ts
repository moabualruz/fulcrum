import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProductDb } from "./types.ts";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export async function applyProductMigrations(db: ProductDb): Promise<readonly string[]> {
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

export const runMigrations = applyProductMigrations;

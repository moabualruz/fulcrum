import type { SqlExecutor } from "./sql.ts";
import { productStoreMigrations } from "../product-store/db/migrations/index.ts";

export async function applyProductMigrations(db: SqlExecutor): Promise<readonly string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const applied: string[] = [];
  for (const migration of productStoreMigrations) {
    const name = migration.name;
    const rows = await db.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [name],
    );
    if (rows.length > 0) continue;
    await db.exec(migration.sql);
    await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    applied.push(name);
  }
  return applied;
}

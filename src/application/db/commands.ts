import { openDatabase, resolveDatabaseConfig, type DbBackend } from "../../config/database.ts";
import { applyProductMigrations } from "../../db/product-migrations.ts";

export interface ProductMigrationInput {
  backend?: DbBackend;
  url?: string;
}

export interface ProductMigrationResult {
  backend: DbBackend;
  applied: readonly string[];
  pending: readonly string[];
  current: string | null;
  ok: true;
}

export interface ProductDbStatus {
  backend: DbBackend;
  current: string | null;
  pending: string[];
  pastDue: number;
  ok: true;
}

export async function runExplicitProductMigration(input: ProductMigrationInput): Promise<ProductMigrationResult> {
  const config = resolveDatabaseConfig({
    cli: {
      backend: input.backend,
      url: input.url,
    },
  });
  const db = await openDatabase(config);
  try {
    const applied = await applyProductMigrations(db);
    const rows = await db.query<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY name ASC",
    );
    return {
      backend: config.backend,
      applied,
      pending: [],
      current: rows.at(-1)?.name ?? null,
      ok: true,
    };
  } finally {
    await db.close();
  }
}

export function defaultProductDbStatus(): ProductDbStatus {
  const config = resolveDatabaseConfig();
  return {
    backend: config.backend,
    current: null,
    pending: [],
    pastDue: 0,
    ok: true,
  };
}

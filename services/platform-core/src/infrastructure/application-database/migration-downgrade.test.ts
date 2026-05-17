import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { SchemaMigration } from "@platform-core/infrastructure/application-database/entities/SchemaMigration.ts";

const MIGRATIONS_PATH = join(process.cwd(), "services/platform-core/src/infrastructure/application-database/migrations");

describe("migration downgrade smoke", () => {
  test("every TypeORM migration implements down()", async () => {
    const files = (await readdir(MIGRATIONS_PATH))
      .filter((name) => /\.ts$/.test(name) && !name.startsWith("."))
      .sort();
    const missingDown: string[] = [];

    for (const file of files) {
      const contents = await Bun.file(`${MIGRATIONS_PATH}/${file}`).text();
      if (!/async\s+down\s*\(/.test(contents)) {
        missingDown.push(file);
      }
    }

    expect(missingDown).toEqual([]);
  });

  test("migrations run up successfully against PGlite", async () => {
    let db: TestOrm | null = null;
    try {
      db = await createTestOrm();
      // Verify we can query the schema_migrations table
      const meta = db.ds.entityMetadatas.find(
        (m) => m.tableName === "fulcrum_schema_migrations",
      );
      expect(meta).toBeDefined();

      const orgRows = await db.em.query(
        `SELECT count(*)::text AS count FROM orgs`,
      );
      expect(Number(orgRows[0]?.count)).toBeGreaterThanOrEqual(0);
    } finally {
      await db?.close();
    }
  });
});

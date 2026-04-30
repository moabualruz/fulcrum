import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { openPostgres } from "./db/postgres.ts";
import type { ProductDb } from "./db/types.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-product-kernel-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function assertCoreSql(db: ProductDb): Promise<void> {
  await db.exec("CREATE TABLE pk_probe (id text PRIMARY KEY, body text NOT NULL)");
  await db.query("INSERT INTO pk_probe (id, body) VALUES ($1, $2)", ["one", "hello world"]);
  const rows = await db.query<{ id: string; body: string }>(
    "SELECT id, body FROM pk_probe WHERE id = $1",
    ["one"],
  );
  expect(rows).toEqual([{ id: "one", body: "hello world" }]);
}

describe("product kernel database compatibility", () => {
  test("PGlite supports core SQL contract", async () => {
    const db = await openPglite(join(scratch, "pgdata"));
    try {
      await assertCoreSql(db);
      expect(db.engine).toBe("pglite");
    } finally {
      await db.close();
    }
  });

  test.skipIf(!process.env["DATABASE_URL"])("PostgreSQL supports core SQL contract", async () => {
    const db = openPostgres(process.env["DATABASE_URL"] as string);
    try {
      await assertCoreSql(db);
      expect(db.engine).toBe("postgres");
    } finally {
      await db.close();
    }
  });
});

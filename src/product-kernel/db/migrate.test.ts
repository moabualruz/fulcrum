import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "./pglite.ts";
import { migrateIsolatedStore } from "./migrate.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-migrate-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const REQUIRED_TABLES = [
  "orgs",
  "projects",
  "repos",
  "documents",
  "tasks",
  "memories",
  "agent_runs",
  "artifacts",
  "edges",
  "events",
  "search_documents",
  "jobs",
  "marketplace_listings",
  "org_marketplace_keys",
] as const;

async function tableExists(
  db: Awaited<ReturnType<typeof openIsolatedStore>>,
  name: string,
): Promise<boolean> {
  const rows = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = $1 AND relkind = 'r'`,
    [name],
  );
  return (rows[0]?.count ?? 0) > 0;
}

describe("product kernel migrations", () => {
  test("creates the required tables on a fresh database", async () => {
    const db = await openIsolatedStore(join(scratch, "fresh"));
    try {
      const applied = await migrateIsolatedStore(db);
      expect(applied.length).toBeGreaterThanOrEqual(4);
      for (const name of REQUIRED_TABLES) {
        expect(await tableExists(db, name)).toBe(true);
      }
    } finally {
      await db.close();
    }
  });

  test("is idempotent on re-run", async () => {
    const db = await openIsolatedStore(join(scratch, "idem"));
    try {
      await migrateIsolatedStore(db);
      const second = await migrateIsolatedStore(db);
      expect(second).toEqual([]);
      for (const name of REQUIRED_TABLES) {
        expect(await tableExists(db, name)).toBe(true);
      }
    } finally {
      await db.close();
    }
  });

  test("populates search_documents.search_vector via the generated tsvector column", async () => {
    const db = await openIsolatedStore(join(scratch, "fts"));
    try {
      await migrateIsolatedStore(db);
      await db.query(
        `INSERT INTO search_documents (id, org_id, source_kind, source_id, title, body)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["s1", "o1", "task", "t1", "find product kernel", "kernel body"],
      );
      const rows = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM search_documents
         WHERE search_vector @@ plainto_tsquery('english', $1)`,
        ["kernel"],
      );
      expect(rows[0]?.count ?? 0).toBe(1);
    } finally {
      await db.close();
    }
  });
});

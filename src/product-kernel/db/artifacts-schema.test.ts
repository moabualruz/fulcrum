/**
 * Artifacts schema migration tests (P10#01).
 * RED: verifies new columns + indexes added by 0004_artifacts.sql exist after migration.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "./pglite.ts";
import { runMigrations } from "./migrate.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-artifacts-schema-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function columnExists(
  db: Awaited<ReturnType<typeof openPglite>>,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return (rows[0]?.count ?? 0) > 0;
}

async function indexExists(
  db: Awaited<ReturnType<typeof openPglite>>,
  indexName: string,
): Promise<boolean> {
  const rows = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM pg_indexes WHERE indexname = $1`,
    [indexName],
  );
  return (rows[0]?.count ?? 0) > 0;
}

describe("artifacts schema migration (P10#01)", () => {
  test("artifacts table has all extended columns after migration", async () => {
    const db = await openPglite(join(scratch, "cols"));
    try {
      await runMigrations(db);

      const required = [
        "filename",
        "size_bytes",
        "path",
        "checksum_sha256",
        "metadata_json",
        "archived",
        "retention_until",
      ];
      for (const col of required) {
        expect(await columnExists(db, "artifacts", col)).toBe(true);
      }
    } finally {
      await db.close();
    }
  });

  test("artifacts_org_project_date index exists", async () => {
    const db = await openPglite(join(scratch, "idx1"));
    try {
      await runMigrations(db);
      expect(await indexExists(db, "artifacts_org_project_date")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("artifacts_org_run index exists", async () => {
    const db = await openPglite(join(scratch, "idx2"));
    try {
      await runMigrations(db);
      expect(await indexExists(db, "artifacts_org_run")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("artifacts_org_task index exists", async () => {
    const db = await openPglite(join(scratch, "idx3"));
    try {
      await runMigrations(db);
      expect(await indexExists(db, "artifacts_org_task")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("artifacts_checksum index exists", async () => {
    const db = await openPglite(join(scratch, "idx4"));
    try {
      await runMigrations(db);
      expect(await indexExists(db, "artifacts_checksum")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("artifacts_retention index exists", async () => {
    const db = await openPglite(join(scratch, "idx5"));
    try {
      await runMigrations(db);
      expect(await indexExists(db, "artifacts_retention")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("artifacts_org_archived_date index exists", async () => {
    const db = await openPglite(join(scratch, "idx6"));
    try {
      await runMigrations(db);
      expect(await indexExists(db, "artifacts_org_archived_date")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("projects table has artifact_retention_days column", async () => {
    const db = await openPglite(join(scratch, "proj"));
    try {
      await runMigrations(db);
      expect(await columnExists(db, "projects", "artifact_retention_days")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("migration is idempotent (apply twice, no error)", async () => {
    const db = await openPglite(join(scratch, "idem"));
    try {
      await runMigrations(db);
      const second = await runMigrations(db);
      // second run should skip already-applied migrations
      expect(second).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("artifacts row with new columns can be inserted and queried", async () => {
    const db = await openPglite(join(scratch, "insert"));
    try {
      await runMigrations(db);

      await db.query(
        `INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3)`,
        ["org1", "acme", "Acme"],
      );
      await db.query(
        `INSERT INTO artifacts
           (id, org_id, kind, title, filename, path, checksum_sha256, mime, archived)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          "art1",
          "org1",
          "file",
          "Report",
          "report.txt",
          "acme/global/manual/report.txt",
          "abc123",
          "text/plain",
          false,
        ],
      );
      const rows = await db.query<{ filename: string; archived: boolean }>(
        `SELECT filename, archived FROM artifacts WHERE id = $1`,
        ["art1"],
      );
      expect(rows[0]?.filename).toBe("report.txt");
      expect(rows[0]?.archived).toBe(false);
    } finally {
      await db.close();
    }
  });
});

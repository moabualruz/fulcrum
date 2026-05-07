/**
 * P11#01 — Search & Discovery schema migration tests.
 * RED → GREEN: run before and after creating 0004_search_extended.sql.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore, migrateIsolatedStore } from "../../test-support/product-fixtures.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-search-schema-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

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

async function indexExists(
  db: Awaited<ReturnType<typeof openIsolatedStore>>,
  name: string,
): Promise<boolean> {
  const rows = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = $1 AND relkind = 'i'`,
    [name],
  );
  return (rows[0]?.count ?? 0) > 0;
}

describe("P11#01 search schema extension", () => {
  test("search_documents table has metadata jsonb column", async () => {
    const db = await openIsolatedStore(join(scratch, "meta"));
    try {
      await migrateIsolatedStore(db);
      const rows = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM information_schema.columns
         WHERE table_name = 'search_documents' AND column_name = 'metadata'`,
        [],
      );
      expect(rows[0]?.count ?? 0).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("search_documents has GIN index on metadata", async () => {
    const db = await openIsolatedStore(join(scratch, "gin"));
    try {
      await migrateIsolatedStore(db);
      expect(await indexExists(db, "search_documents_metadata_idx")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("search_documents has unique constraint on (org_id, source_kind, source_id)", async () => {
    const db = await openIsolatedStore(join(scratch, "uniq"));
    try {
      await migrateIsolatedStore(db);
      // Insert a row then try duplicate — should throw
      await db.query(
        `INSERT INTO search_documents (id, org_id, source_kind, source_id, title, body)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["d1", "org1", "task", "t1", "title", "body"],
      );
      await expect(
        db.query(
          `INSERT INTO search_documents (id, org_id, source_kind, source_id, title, body)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          ["d2", "org1", "task", "t1", "other", "other"],
        ),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  test("search_clicks table exists with org_id and composite index", async () => {
    const db = await openIsolatedStore(join(scratch, "clicks"));
    try {
      await migrateIsolatedStore(db);
      expect(await tableExists(db, "search_clicks")).toBe(true);
      // Verify org_id column present
      const rows = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM information_schema.columns
         WHERE table_name = 'search_clicks' AND column_name = 'org_id'`,
        [],
      );
      expect(rows[0]?.count ?? 0).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("search_clicks composite index exists", async () => {
    const db = await openIsolatedStore(join(scratch, "clicks-idx"));
    try {
      await migrateIsolatedStore(db);
      expect(await indexExists(db, "search_clicks_scope_idx")).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("saved_views table exists and accepts viewType = 'search'", async () => {
    const db = await openIsolatedStore(join(scratch, "saved"));
    try {
      await migrateIsolatedStore(db);
      expect(await tableExists(db, "saved_views")).toBe(true);
      // FK requires a real org + project row (0004 schema has NOT NULL project_id)
      await db.query(
        `INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3)`,
        ["org1", "org1", "Org One"],
      );
      await db.query(
        `INSERT INTO projects (id, org_id, slug, name) VALUES ($1, $2, $3, $4)`,
        ["p1", "org1", "p1", "Project One"],
      );
      await db.query(
        `INSERT INTO saved_views (id, org_id, project_id, scope, view_type, name, filters)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ["v1", "org1", "p1", "project", "search", "My search", "{}"],
      );
      const rows = await db.query<{ view_type: string }>(
        `SELECT view_type FROM saved_views WHERE id = $1`,
        ["v1"],
      );
      expect(rows[0]?.view_type).toBe("search");
    } finally {
      await db.close();
    }
  });

  test("migration is idempotent for search extension", async () => {
    const db = await openIsolatedStore(join(scratch, "idem"));
    try {
      await migrateIsolatedStore(db);
      const second = await migrateIsolatedStore(db);
      expect(second).toEqual([]);
      expect(await tableExists(db, "search_clicks")).toBe(true);
      expect(await tableExists(db, "saved_views")).toBe(true);
    } finally {
      await db.close();
    }
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore, migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-embeddings-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("embedding schema (P8#02)", () => {
  test("migration creates memory_embeddings and doc_embeddings tables", async () => {
    const db = await openIsolatedStore(join(scratch, "tables"));
    try {
      await migrateIsolatedStore(db);
      for (const tbl of ["memory_embeddings", "doc_embeddings"]) {
        const rows = await db.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = $1 AND relkind = 'r'`,
          [tbl],
        );
        expect(rows[0]?.count ?? 0).toBe(1);
      }
    } finally {
      await db.close();
    }
  });

  test("embedding column is vector(384)", async () => {
    const db = await openIsolatedStore(join(scratch, "vectype"));
    try {
      await migrateIsolatedStore(db);
      for (const tbl of ["memory_embeddings", "doc_embeddings"]) {
        const rows = await db.query<{ typname: string; atttypmod: number }>(
          `SELECT t.typname, a.atttypmod
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_type t ON t.oid = a.atttypid
           WHERE c.relname = $1 AND a.attname = 'embedding'`,
          [tbl],
        );
        expect(rows.length).toBe(1);
        expect(rows[0]!.typname).toBe("vector");
        // atttypmod for vector(384) = 384 + 4 (header) in some implementations,
        // or just 384. Check it encodes 384.
        const dim = rows[0]!.atttypmod;
        // pgvector stores dimension as atttypmod directly (384)
        expect(dim).toBe(384);
      }
    } finally {
      await db.close();
    }
  });

  test("HNSW index metadata present", async () => {
    const db = await openIsolatedStore(join(scratch, "hnsw"));
    try {
      await migrateIsolatedStore(db);
      for (const idx of ["memory_embeddings_hnsw", "doc_embeddings_hnsw"]) {
        const rows = await db.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = $1 AND relkind = 'i'`,
          [idx],
        );
        expect(rows[0]?.count ?? 0).toBe(1);
      }
    } finally {
      await db.close();
    }
  });

  test("memory_embeddings cascade deletes with parent memory row", async () => {
    const db = await openIsolatedStore(join(scratch, "cascade"));
    try {
      await migrateIsolatedStore(db);
      // Insert org + memory
      await db.query(
        `INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3)`,
        ["o1", "test-org", "Test Org"],
      );
      await db.query(
        `INSERT INTO memories (id, org_id, scope, kind, key, body)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["m1", "o1", "global", "fact", "test-key", "test body"],
      );
      // Insert embedding row
      // Use a 384-dim zero vector string
      const zeroVec = `[${Array(384).fill("0").join(",")}]`;
      await db.query(
        `INSERT INTO memory_embeddings (memory_id, embedding, model_id)
         VALUES ($1, $2::vector, $3)`,
        ["m1", zeroVec, "bge-small-en-v1.5"],
      );
      // Verify it exists
      const before = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM memory_embeddings WHERE memory_id = $1`,
        ["m1"],
      );
      expect(before[0]?.count).toBe(1);
      // Delete parent memory
      await db.query(`DELETE FROM memories WHERE id = $1`, ["m1"]);
      // Embedding should be cascade-deleted
      const after = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM memory_embeddings WHERE memory_id = $1`,
        ["m1"],
      );
      expect(after[0]?.count).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("migration is idempotent on re-run", async () => {
    const db = await openIsolatedStore(join(scratch, "idem"));
    try {
      await migrateIsolatedStore(db);
      const second = await migrateIsolatedStore(db);
      expect(second).toEqual([]);
      // Tables still there
      for (const tbl of ["memory_embeddings", "doc_embeddings"]) {
        const rows = await db.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = $1 AND relkind = 'r'`,
          [tbl],
        );
        expect(rows[0]?.count ?? 0).toBe(1);
      }
    } finally {
      await db.close();
    }
  });

  test("doc_embeddings cascade deletes with parent document row", async () => {
    const db = await openIsolatedStore(join(scratch, "doc-cascade"));
    try {
      await migrateIsolatedStore(db);
      await db.query(
        `INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3)`,
        ["o2", "org2", "Org 2"],
      );
      await db.query(
        `INSERT INTO documents (id, org_id, kind, title, body)
         VALUES ($1, $2, $3, $4, $5)`,
        ["d1", "o2", "note", "Test Doc", "body"],
      );
      const zeroVec = `[${Array(384).fill("0").join(",")}]`;
      await db.query(
        `INSERT INTO doc_embeddings (doc_id, embedding, model_id)
         VALUES ($1, $2::vector, $3)`,
        ["d1", zeroVec, "bge-small-en-v1.5"],
      );
      await db.query(`DELETE FROM documents WHERE id = $1`, ["d1"]);
      const after = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM doc_embeddings WHERE doc_id = $1`,
        ["d1"],
      );
      expect(after[0]?.count).toBe(0);
    } finally {
      await db.close();
    }
  });
});

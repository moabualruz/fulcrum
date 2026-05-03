import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";

import { openPglite } from "../../src/product-kernel/db/pglite.ts";
import { runMigrations } from "../../src/product-kernel/db/migrate.ts";
import type { ProductDb } from "../../src/product-kernel/db/types.ts";
import { querySearchDocuments } from "../../src/search/query.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-search-query-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

async function insertDoc(
  db: ProductDb,
  input: {
    id: string;
    orgId?: string;
    projectId?: string | null;
    kind: string;
    entityId: string;
    title: string;
    body?: string;
    labels?: readonly string[];
    metadata?: Record<string, unknown>;
    updatedAt?: string;
  },
) {
  await db.query(
    `INSERT INTO search_documents
       (id, org_id, project_id, source_kind, source_id, title, body, labels, metadata, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::jsonb, $10::timestamptz)`,
    [
      input.id,
      input.orgId ?? "org-search",
      input.projectId ?? null,
      input.kind,
      input.entityId,
      input.title,
      input.body ?? "",
      `{${(input.labels ?? []).join(",")}}`,
      JSON.stringify(input.metadata ?? {}),
      input.updatedAt ?? "2026-05-03T00:00:00.000Z",
    ],
  );
}

describe("P11#05 FTS query + ranking", () => {
  test("title matches rank above body-only matches", async () => {
    const db = await freshDb("title-rank");
    try {
      await insertDoc(db, {
        id: "title-hit",
        kind: "doc",
        entityId: "doc-title",
        title: "Alpha release plan",
        body: "notes",
      });
      await insertDoc(db, {
        id: "body-hit",
        kind: "doc",
        entityId: "doc-body",
        title: "Release notes",
        body: "Alpha appears only in body",
      });

      const result = await querySearchDocuments(db, { orgId: "org-search", q: "alpha" });

      expect(result.results.map((row) => row.id)).toEqual(["title-hit", "body-hit"]);
      expect(result.results[0]!.score).toBeGreaterThan(result.results[1]!.score);
    } finally {
      await db.close();
    }
  });

  test("newer entities rank higher when text relevance matches", async () => {
    const db = await freshDb("recency-rank");
    try {
      await insertDoc(db, {
        id: "old-task",
        kind: "task",
        entityId: "old-task",
        title: "Alpha task",
        metadata: { status: "open" },
        updatedAt: "2026-03-01T00:00:00.000Z",
      });
      await insertDoc(db, {
        id: "new-task",
        kind: "task",
        entityId: "new-task",
        title: "Alpha task",
        metadata: { status: "open" },
        updatedAt: "2026-05-03T00:00:00.000Z",
      });

      const result = await querySearchDocuments(db, {
        orgId: "org-search",
        q: "alpha",
        now: new Date("2026-05-03T00:00:00.000Z"),
      });

      expect(result.results.map((row) => row.id)).toEqual(["new-task", "old-task"]);
    } finally {
      await db.close();
    }
  });

  test("kind boost ranks open tasks above completed tasks for same query", async () => {
    const db = await freshDb("kind-boost");
    try {
      await insertDoc(db, {
        id: "done-task",
        kind: "task",
        entityId: "done-task",
        title: "Alpha task",
        metadata: { status: "done" },
      });
      await insertDoc(db, {
        id: "open-task",
        kind: "task",
        entityId: "open-task",
        title: "Alpha task",
        metadata: { status: "open" },
      });

      const result = await querySearchDocuments(db, { orgId: "org-search", q: "alpha" });

      expect(result.results.map((row) => row.id)).toEqual(["open-task", "done-task"]);
    } finally {
      await db.close();
    }
  });

  test("facet filters compose, facet counts reflect filtered result set, and pagination slices ranked rows", async () => {
    const db = await freshDb("filters-pagination");
    try {
      await insertDoc(db, {
        id: "doc-1",
        kind: "doc",
        entityId: "doc-1",
        title: "Alpha architecture",
        labels: ["search"],
        metadata: { doc_type: "adr", status: "published", author_id: "u1" },
      });
      await insertDoc(db, {
        id: "doc-2",
        kind: "doc",
        entityId: "doc-2",
        title: "Alpha runbook",
        labels: ["search"],
        metadata: { doc_type: "runbook", status: "published", author_id: "u1" },
      });
      await insertDoc(db, {
        id: "task-1",
        kind: "task",
        entityId: "task-1",
        title: "Alpha task",
        labels: ["search"],
        metadata: { status: "open", assignee_id: "me" },
      });

      const result = await querySearchDocuments(db, {
        orgId: "org-search",
        q: "alpha",
        kind: "doc",
        tags: ["search"],
        status: "published",
        authorId: "u1",
        limit: 1,
        offset: 1,
      });

      expect(result.total).toBe(2);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.kind).toBe("doc");
      expect(result.facetCounts.kind).toEqual({ doc: 2 });
      expect(result.facetCounts.docType).toEqual({ adr: 1, runbook: 1 });
      expect(result.facetCounts.status).toEqual({ published: 2 });
    } finally {
      await db.close();
    }
  });

  test("empty query returns top N by recency and deduplicates on org-kind-entity", async () => {
    const db = await freshDb("empty-dedupe");
    try {
      await insertDoc(db, {
        id: "older",
        kind: "repo",
        entityId: "repo-older",
        title: "Older repo",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      await insertDoc(db, {
        id: "newer",
        kind: "repo",
        entityId: "repo-newer",
        title: "Newer repo",
        updatedAt: "2026-05-03T00:00:00.000Z",
      });
      await db.exec(`
        ALTER TABLE search_documents
          DROP CONSTRAINT IF EXISTS search_documents_org_kind_entity_uniq
      `);
      await insertDoc(db, {
        id: "dup-old",
        kind: "memory",
        entityId: "memory-1",
        title: "Duplicate memory older",
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      await insertDoc(db, {
        id: "dup-new",
        kind: "memory",
        entityId: "memory-1",
        title: "Duplicate memory newer",
        updatedAt: "2026-05-02T00:00:00.000Z",
      });

      const result = await querySearchDocuments(db, {
        orgId: "org-search",
        q: "",
        limit: 3,
        now: new Date("2026-05-03T00:00:00.000Z"),
      });

      expect(result.total).toBe(3);
      expect(result.results.map((row) => row.id)).toEqual(["newer", "dup-new", "older"]);
      expect(result.results.map((row) => `${row.kind}:${row.entityId}`)).toEqual([
        "repo:repo-newer",
        "memory:memory-1",
        "repo:repo-older",
      ]);
    } finally {
      await db.close();
    }
  });
});

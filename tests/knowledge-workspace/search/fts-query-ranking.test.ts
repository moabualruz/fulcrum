import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";

import { openIsolatedStore, migrateIsolatedStore, type TestStore } from "@test-support/product-workspace-fixtures.ts";
import { querySearchDocuments } from "@knowledge-workspace/application/search/query.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-search-query-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  await db.exec(`ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS embedding text NULL`);
  return db;
}

async function insertDoc(
  db: TestStore,
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
    embedding?: readonly number[] | null;
    updatedAt?: string;
  },
) {
  await db.query(
    `INSERT INTO search_documents
       (id, org_id, project_id, source_kind, source_id, title, body, labels, metadata, embedding, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::jsonb, $10, $11::timestamptz)`,
    [
      input.id,
      input.orgId ?? "org-search",
      input.projectId ?? null,
      input.kind,
      input.entityId,
      input.title,
      input.body ?? "",
      `{${(input.labels ?? []).map((label) => `"${label.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`,
      JSON.stringify(input.metadata ?? {}),
      input.embedding === undefined ? null : JSON.stringify(input.embedding),
      input.updatedAt ?? "2026-05-03T00:00:00.000Z",
    ],
  );
}

describe("FTS query and ranking", () => {
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

  test("metadata and date filters compose with clamped pagination against real search rows", async () => {
    const db = await freshDb("metadata-date-filters");
    try {
      await insertDoc(db, {
        id: "matching-run",
        kind: "run",
        entityId: "run-1",
        title: "Deploy verification",
        labels: ["release", "prod"],
        metadata: {
          sprint_id: "sprint-1",
          status: "succeeded",
          assignee_id: "agent-1",
          repo_id: "repo-1",
        },
        updatedAt: "2026-05-04T00:00:00.000Z",
      });
      await insertDoc(db, {
        id: "wrong-sprint",
        kind: "run",
        entityId: "run-2",
        title: "Deploy verification",
        labels: ["release", "prod"],
        metadata: {
          sprint_id: "sprint-2",
          status: "succeeded",
          assignee_id: "agent-1",
          repo_id: "repo-1",
        },
        updatedAt: "2026-05-04T00:00:00.000Z",
      });
      await insertDoc(db, {
        id: "too-old",
        kind: "run",
        entityId: "run-3",
        title: "Deploy verification",
        labels: ["release", "prod"],
        metadata: {
          sprint_id: "sprint-1",
          status: "succeeded",
          assignee_id: "agent-1",
          repo_id: "repo-1",
        },
        updatedAt: "2026-04-01T00:00:00.000Z",
      });

      const result = await querySearchDocuments(db, {
        orgId: "org-search",
        q: "deploy",
        sprintId: "sprint-1",
        status: "succeeded",
        assigneeId: "agent-1",
        repoId: "repo-1",
        tags: ["release", "prod"],
        createdFrom: new Date("2026-05-01T00:00:00.000Z"),
        createdTo: new Date("2026-05-31T00:00:00.000Z"),
        limit: 999,
        offset: -10,
      });

      expect(result.total).toBe(1);
      expect(result.results.map((row) => row.id)).toEqual(["matching-run"]);
      expect(result.facetCounts.status).toEqual({ succeeded: 1 });
      expect(result.facetCounts.repoId).toEqual({ "repo-1": 1 });
      expect(result.facetCounts.assigneeId).toEqual({ "agent-1": 1 });
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

  test("embeddings flag defaults OFF and keeps BM25-only ranking even when embeddings exist", async () => {
    const db = await freshDb("embeddings-off-ranking");
    const previousFeatures = process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FEATURES"];
    try {
      await insertDoc(db, {
        id: "exact",
        kind: "doc",
        entityId: "exact",
        title: "Deploy to production",
        embedding: [0, 1],
      });
      await insertDoc(db, {
        id: "semantic",
        kind: "doc",
        entityId: "semantic",
        title: "Release pipeline",
        body: "Ship build",
        embedding: [1, 0],
      });

      const result = await querySearchDocuments(db, {
        orgId: "org-search",
        q: "deploy production",
        embedQuery: async () => [1, 0],
      });

      expect(result.results.map((row) => row.id)).toEqual(["exact"]);
    } finally {
      if (previousFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = previousFeatures;
      await db.close();
    }
  });

  test("embeddings flag ON uses hybrid scoring so semantic matches can outrank exact text matches", async () => {
    const db = await freshDb("embeddings-hybrid-ranking");
    const previousFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "embeddings";
    try {
      await insertDoc(db, {
        id: "exact",
        kind: "doc",
        entityId: "exact",
        title: "Deploy to production",
        body: "Run command",
        embedding: [0, 1],
      });
      await insertDoc(db, {
        id: "semantic",
        kind: "doc",
        entityId: "semantic",
        title: "Release pipeline",
        body: "Promote build through rollout gates",
        embedding: [1, 0],
      });

      const result = await querySearchDocuments(db, {
        orgId: "org-search",
        q: "deploy production",
        embedQuery: async (query) => {
          expect(query).toBe("deploy production");
          return [1, 0];
        },
      });

      expect(result.results.map((row) => row.id)).toEqual(["semantic", "exact"]);
      expect(result.results[0]!.score).toBeGreaterThan(result.results[1]!.score);
    } finally {
      if (previousFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = previousFeatures;
      await db.close();
    }
  });

  test("empty query applies deterministic domain boosts across memory, docs, and runs", async () => {
    const db = await freshDb("domain-boosts-empty-query");
    try {
      await insertDoc(db, {
        id: "plain-doc",
        kind: "doc",
        entityId: "plain-doc",
        title: "Plain note",
        metadata: { doc_type: "note" },
        updatedAt: "2026-05-01T00:00:00.000Z",
      });
      await insertDoc(db, {
        id: "spec-doc",
        kind: "doc",
        entityId: "spec-doc",
        title: "Spec note",
        metadata: { doc_type: "spec" },
        updatedAt: "2026-05-01T00:00:00.000Z",
      });
      await insertDoc(db, {
        id: "low-memory",
        kind: "memory",
        entityId: "low-memory",
        title: "Memory note",
        metadata: { importance: "low" },
        updatedAt: "2026-05-01T00:00:00.000Z",
      });
      await insertDoc(db, {
        id: "high-memory",
        kind: "memory",
        entityId: "high-memory",
        title: "Critical memory",
        metadata: { importance: "high" },
        updatedAt: "2026-05-01T00:00:00.000Z",
      });
      await insertDoc(db, {
        id: "failed-run",
        kind: "run",
        entityId: "failed-run",
        title: "Failed run",
        metadata: { status: "failed" },
        updatedAt: "2026-05-01T00:00:00.000Z",
      });
      await insertDoc(db, {
        id: "success-run",
        kind: "run",
        entityId: "success-run",
        title: "Successful run",
        metadata: { status: "success" },
        updatedAt: "2026-05-01T00:00:00.000Z",
      });

      const result = await querySearchDocuments(db, {
        orgId: "org-search",
        now: new Date("2026-05-01T00:00:00.000Z"),
      });

      expect(result.results.map((row) => row.id).slice(0, 3)).toEqual([
        "high-memory",
        "spec-doc",
        "success-run",
      ]);
      expect(result.results.find((row) => row.id === "high-memory")!.score).toBeGreaterThan(
        result.results.find((row) => row.id === "low-memory")!.score,
      );
      expect(result.results.find((row) => row.id === "spec-doc")!.score).toBeGreaterThan(
        result.results.find((row) => row.id === "plain-doc")!.score,
      );
      expect(result.results.find((row) => row.id === "success-run")!.score).toBeGreaterThan(
        result.results.find((row) => row.id === "failed-run")!.score,
      );
    } finally {
      await db.close();
    }
  });

  test("project, doc type, and quoted tag filters are enforced by the database query", async () => {
    const db = await freshDb("project-doc-tag-filters");
    try {
      await insertDoc(db, {
        id: "matching",
        projectId: "project-a",
        kind: "doc",
        entityId: "doc-a",
        title: "Alpha design",
        labels: ["needs review", "quote\"tag"],
        metadata: { doc_type: "adr", status: "published", author_id: "author-a" },
      });
      await insertDoc(db, {
        id: "wrong-project",
        projectId: "project-b",
        kind: "doc",
        entityId: "doc-b",
        title: "Alpha design",
        labels: ["needs review", "quote\"tag"],
        metadata: { doc_type: "adr", status: "published", author_id: "author-a" },
      });
      await insertDoc(db, {
        id: "wrong-doc-type",
        projectId: "project-a",
        kind: "doc",
        entityId: "doc-c",
        title: "Alpha design",
        labels: ["needs review", "quote\"tag"],
        metadata: { doc_type: "runbook", status: "published", author_id: "author-a" },
      });

      const result = await querySearchDocuments(db, {
        orgId: "org-search",
        q: "alpha",
        projectId: "project-a",
        docType: "adr",
        tags: ["needs review", "quote\"tag"],
      });

      expect(result.total).toBe(1);
      expect(result.results[0]).toMatchObject({
        id: "matching",
        projectId: "project-a",
        kind: "doc",
        entityId: "doc-a",
      });
      expect(result.results[0]!.labels).toEqual(["needs review", 'quote"tag']);
      expect(result.facetCounts.docType).toEqual({ adr: 1 });
    } finally {
      await db.close();
    }
  });

  test("hybrid search ignores malformed and opposite embeddings while preserving facets", async () => {
    const db = await freshDb("embeddings-hybrid-invalid-vectors");
    const previousFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "embeddings";
    try {
      await insertDoc(db, {
        id: "semantic-hit",
        kind: "doc",
        entityId: "semantic-hit",
        title: "Alpha rollout",
        metadata: { doc_type: "adr", status: "published", author_id: "author-a" },
        embedding: [1, 0],
      });
      await insertDoc(db, {
        id: "opposite",
        kind: "doc",
        entityId: "opposite",
        title: "Alpha rollout",
        metadata: { doc_type: "adr", status: "published", author_id: "author-b" },
        embedding: [-1, 0],
      });
      await insertDoc(db, {
        id: "malformed",
        kind: "doc",
        entityId: "malformed",
        title: "Alpha rollout",
        metadata: { doc_type: "runbook", status: "draft", author_id: "author-c" },
        embedding: null,
      });
      await db.query(`UPDATE search_documents SET embedding = $1 WHERE id = $2`, ["not-json", "malformed"]);

      const result = await querySearchDocuments(db, {
        orgId: "org-search",
        q: "alpha",
        embedQuery: async () => [1, 0],
      });

      expect(result.results.map((row) => row.id)).toEqual(["semantic-hit", "malformed", "opposite"]);
      expect(result.total).toBe(3);
      expect(result.results[0]!.score).toBeGreaterThan(result.results[1]!.score);
      expect(result.facetCounts.kind).toEqual({ doc: 3 });
      expect(result.facetCounts.docType).toEqual({ adr: 2, runbook: 1 });
      expect(result.facetCounts.status).toEqual({ published: 2, draft: 1 });
      expect(result.facetCounts.authorId).toEqual({ "author-a": 1, "author-b": 1, "author-c": 1 });
    } finally {
      if (previousFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = previousFeatures;
      await db.close();
    }
  });
});

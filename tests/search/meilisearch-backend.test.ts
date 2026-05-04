import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";

import { openPglite } from "../../src/product-kernel/db/pglite.ts";
import { runMigrations } from "../../src/product-kernel/db/migrate.ts";
import { createLocalOrg } from "../../src/product-kernel/store/repositories.ts";
import type { ProductDb } from "../../src/product-kernel/db/types.ts";
import { querySearchDocuments } from "../../src/search/query.ts";
import {
  SearchIndexHook,
  type SearchDocumentInput,
} from "../../src/search/indexers/base.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-meilisearch-backend-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

class TaskSearchIndexHook extends SearchIndexHook {
  override readonly kind = "task";

  protected override async buildDocument(entityId: string, orgId: string): Promise<SearchDocumentInput> {
    return {
      orgId,
      sourceKind: this.kind,
      sourceId: entityId,
      title: `Task ${entityId}`,
      body: "backend search body",
      labels: ["search"],
      metadata: { status: "open", assignee_id: "u1" },
    };
  }
}

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: name, name });
  return { db, org };
}

function withEnv<T>(env: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return run().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function installFetchMock(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): () => void {
  const previous = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    return handler(href, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = previous;
  };
}

async function insertPgliteDoc(db: ProductDb, orgId: string) {
  await db.query(
    `INSERT INTO search_documents
       (id, org_id, source_kind, source_id, title, body, labels, metadata, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::jsonb, $9::timestamptz)`,
    [
      "pg-task",
      orgId,
      "task",
      "task-pg",
      "Alpha local task",
      "PGlite fallback body",
      "{search}",
      JSON.stringify({ status: "open" }),
      "2026-05-03T00:00:00.000Z",
    ],
  );
}

describe("P11#15 Meilisearch backend", () => {
  test("external-search-meilisearch defaults OFF and makes no Meilisearch calls", async () => {
    const { db, org } = await freshDb("off-default");
    const calls: string[] = [];
    const restoreFetch = installFetchMock((url) => {
      calls.push(url);
      throw new Error("fetch should not be called");
    });
    try {
      await withEnv(
        {
          FULCRUM_FEATURES: undefined,
          MEILISEARCH_URL: "http://meili.test",
          MEILISEARCH_KEY: "secret",
        },
        async () => {
          await insertPgliteDoc(db, org.id);

          const result = await querySearchDocuments(db, { orgId: org.id, q: "alpha" });

          expect(result.results.map((row) => row.id)).toEqual(["pg-task"]);
          expect(calls).toEqual([]);
        },
      );
    } finally {
      restoreFetch();
      await db.close();
    }
  });

  test("flag ON routes query to Meilisearch and preserves search result shape", async () => {
    const { db, org } = await freshDb("query-on");
    const requests: { url: string; body: unknown; key: string | null }[] = [];
    const restoreFetch = installFetchMock(async (url, init) => {
      requests.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
        key: init?.headers instanceof Headers ? init.headers.get("Authorization") : null,
      });
      return Response.json({
        hits: [
          {
            id: "meili-task",
            orgId: org.id,
            projectId: null,
            kind: "task",
            entityId: "task-meili",
            title: "Alpha remote task",
            body: "Meilisearch body",
            labels: ["search"],
            metadata: { status: "open" },
            updatedAt: "2026-05-03T00:00:00.000Z",
            _rankingScore: 0.9,
          },
        ],
        estimatedTotalHits: 1,
        facetDistribution: {
          kind: { task: 1 },
          "metadata.status": { open: 1 },
        },
      });
    });
    try {
      await withEnv(
        {
          FULCRUM_FEATURES: "external-search-meilisearch",
          MEILISEARCH_URL: "http://meili.test",
          MEILISEARCH_KEY: "secret",
        },
        async () => {
          const result = await querySearchDocuments(db, { orgId: org.id, q: "alpha", kind: "task", limit: 5 });

          expect(requests).toHaveLength(1);
          expect(requests[0]!.url).toBe("http://meili.test/indexes/search_documents/search");
          expect(requests[0]!.key).toBe("Bearer secret");
          expect(requests[0]!.body).toMatchObject({
            q: "alpha",
            limit: 5,
            filter: [`orgId = "${org.id}"`, 'kind = "task"'],
          });
          expect(result).toEqual({
            results: [
              {
                id: "meili-task",
                orgId: org.id,
                projectId: null,
                kind: "task",
                entityId: "task-meili",
                title: "Alpha remote task",
                body: "Meilisearch body",
                labels: ["search"],
                metadata: { status: "open" },
                updatedAt: new Date("2026-05-03T00:00:00.000Z"),
                score: 0.9,
              },
            ],
            total: 1,
            facetCounts: {
              kind: { task: 1 },
              docType: {},
              status: { open: 1 },
              assigneeId: {},
              repoId: {},
              authorId: {},
            },
          });
        },
      );
    } finally {
      restoreFetch();
      await db.close();
    }
  });

  test("flag ON falls back to PGlite when Meilisearch is unreachable", async () => {
    const { db, org } = await freshDb("fallback");
    const restoreFetch = installFetchMock(() => {
      throw new Error("connection refused");
    });
    try {
      await withEnv(
        {
          FULCRUM_FEATURES: "external-search-meilisearch",
          MEILISEARCH_URL: "http://meili.test",
          MEILISEARCH_KEY: "secret",
        },
        async () => {
          await insertPgliteDoc(db, org.id);

          const result = await querySearchDocuments(db, { orgId: org.id, q: "alpha" });

          expect(result.results.map((row) => row.id)).toEqual(["pg-task"]);
          expect(result.total).toBe(1);
        },
      );
    } finally {
      restoreFetch();
      await db.close();
    }
  });

  test("flag ON dual-writes indexer upsert to PGlite and Meilisearch", async () => {
    const { db, org } = await freshDb("dual-write");
    const requests: { url: string; body: unknown }[] = [];
    const restoreFetch = installFetchMock(async (url, init) => {
      requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return Response.json({ taskUid: 1 });
    });
    try {
      await withEnv(
        {
          FULCRUM_FEATURES: "external-search-meilisearch",
          MEILISEARCH_URL: "http://meili.test",
          MEILISEARCH_KEY: "secret",
        },
        async () => {
          const hook = new TaskSearchIndexHook(db);

          await hook.upsert("task-1", org.id);

          const rows = await db.query<{ title: string }>(
            `SELECT title FROM search_documents WHERE org_id = $1 AND source_kind = $2 AND source_id = $3`,
            [org.id, "task", "task-1"],
          );
          expect(rows).toEqual([{ title: "Task task-1" }]);
          expect(requests).toEqual([
            {
              url: "http://meili.test/indexes/search_documents/documents",
              body: [
                {
                  id: `${org.id}:task:task-1`,
                  orgId: org.id,
                  projectId: null,
                  kind: "task",
                  entityId: "task-1",
                  title: "Task task-1",
                  body: "backend search body",
                  labels: ["search"],
                  metadata: { status: "open", assignee_id: "u1" },
                },
              ],
            },
          ]);
        },
      );
    } finally {
      restoreFetch();
      await db.close();
    }
  });
});

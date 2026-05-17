import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore, migrateIsolatedStore, createLocalOrg, type TestStore } from "@test-support/product-workspace-fixtures.ts";
import {
  IndexerRegistry,
  SearchIndexHook,
  type SearchDocumentInput,
  type SearchIndexHookOptions,
} from "@knowledge-workspace/application/search/indexers/base.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-search-indexers-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

class TaskSearchIndexHook extends SearchIndexHook {
  override readonly kind = "task";

  constructor(db: TestStore, options: SearchIndexHookOptions = {}) {
    super(db, options);
  }

  protected override async buildDocument(entityId: string, orgId: string): Promise<SearchDocumentInput> {
    return {
      orgId,
      sourceKind: this.kind,
      sourceId: entityId,
      title: `Task ${entityId}`,
      body: "kernel search body",
      labels: ["urgent"],
      metadata: { status: "open" },
    };
  }

  async listEntityIds(orgId: string): Promise<string[]> {
    return [`${orgId}-task-1`, `${orgId}-task-2`];
  }
}

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  await db.exec(`ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS embedding text NULL`);
  const org = await createLocalOrg(db, { slug: name, name });
  return { db, org };
}

describe("search indexer hook base", () => {
  test("upsert is org-scoped, idempotent, and populates generated search vector", async () => {
    const { db, org } = await freshDb("upsert");
    try {
      const hook = new TaskSearchIndexHook(db);

      await hook.upsert("task-1", org.id);
      await hook.upsert("task-1", org.id);

      const rows = await db.query<{
        org_id: string;
        source_kind: string;
        source_id: string;
        title: string;
        search_vector: string | null;
        metadata: unknown;
      }>(
        `SELECT org_id, source_kind, source_id, title, search_vector::text AS search_vector, metadata
           FROM search_documents
          WHERE org_id = $1 AND source_kind = $2 AND source_id = $3`,
        [org.id, "task", "task-1"],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.org_id).toBe(org.id);
      expect(rows[0]?.title).toBe("Task task-1");
      expect(rows[0]?.search_vector).toContain("kernel");
      expect(rows[0]?.metadata).toEqual({ status: "open" });
    } finally {
      await db.close();
    }
  });

  test("same entity id in two orgs creates separate rows and remove only deletes scoped row", async () => {
    const db = await openIsolatedStore(join(scratch, "org-scope"));
    try {
      await migrateIsolatedStore(db);
      const orgA = await createLocalOrg(db, { slug: "org-a", name: "Org A" });
      const orgB = await createLocalOrg(db, { slug: "org-b", name: "Org B" });
      const hook = new TaskSearchIndexHook(db);

      await hook.upsert("task-1", orgA.id);
      await hook.upsert("task-1", orgB.id);
      await hook.remove("task-1", orgA.id);

      const rows = await db.query<{ org_id: string }>(
        `SELECT org_id FROM search_documents
          WHERE source_kind = $1 AND source_id = $2
          ORDER BY org_id`,
        ["task", "task-1"],
      );

      expect(rows.map((row) => row.org_id)).toEqual([orgB.id]);
    } finally {
      await db.close();
    }
  });

  test("registry registers, unregisters, and triggers lifecycle hooks by kind", async () => {
    const { db, org } = await freshDb("registry");
    try {
      const hook = new TaskSearchIndexHook(db);
      const registry = new IndexerRegistry();

      registry.register(hook);
      await registry.triggerUpsert("task", "task-1", org.id);
      await registry.triggerRemove("task", "task-1", org.id);
      registry.unregister("task");

      await expect(registry.triggerUpsert("task", "task-2", org.id)).rejects.toThrow(
        "No search indexer registered for kind: task",
      );

      const rows = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM search_documents WHERE org_id = $1`,
        [org.id],
      );
      expect(rows[0]?.count).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("bulkReindex enqueues one org-scoped search.upsert job per entity id", async () => {
    const { db, org } = await freshDb("bulk");
    try {
      const registry = new IndexerRegistry();
      registry.register(new TaskSearchIndexHook(db));

      const queued = await registry.bulkReindex(db, org.id, "task");

      expect(queued).toEqual({ queued: 2 });
      const jobs = await db.query<{ org_id: string; kind: string; payload: Record<string, unknown> }>(
        `SELECT org_id, kind, payload
           FROM jobs
          WHERE org_id = $1 AND queue = $2
          ORDER BY id`,
        [org.id, "search"],
      );
      expect(jobs).toHaveLength(2);
      expect(jobs.map((job) => job.kind)).toEqual(["search.upsert", "search.upsert"]);
      expect(jobs.map((job) => job.payload)).toEqual([
        { kind: "task", entityId: `${org.id}-task-1`, orgId: org.id },
        { kind: "task", entityId: `${org.id}-task-2`, orgId: org.id },
      ]);
    } finally {
      await db.close();
    }
  });

  test("embeddings flag defaults OFF so upsert leaves embedding NULL and does not call sidecar", async () => {
    const { db, org } = await freshDb("embeddings-off-upsert");
    const previousFeatures = process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FEATURES"];
    let calls = 0;
    try {
      const hook = new TaskSearchIndexHook(db, {
        embedText: async () => {
          calls += 1;
          return [0.1, 0.2];
        },
      });

      await hook.upsert("task-embedding-off", org.id);

      const rows = await db.query<{ embedding: string | null }>(
        `SELECT embedding FROM search_documents WHERE source_kind = $1 AND source_id = $2`,
        ["task", "task-embedding-off"],
      );
      expect(calls).toBe(0);
      expect(rows[0]?.embedding).toBeNull();
    } finally {
      if (previousFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = previousFeatures;
      await db.close();
    }
  });

  test("embeddings flag ON calls sidecar and writes embedding vector", async () => {
    const { db, org } = await freshDb("embeddings-on-upsert");
    const previousFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "embeddings";
    const embeddedTexts: string[] = [];
    try {
      const hook = new TaskSearchIndexHook(db, {
        embedText: async (text) => {
          embeddedTexts.push(text);
          return [0.1, 0.2];
        },
      });

      await hook.upsert("task-embedding-on", org.id);

      const rows = await db.query<{ embedding: string | null }>(
        `SELECT embedding FROM search_documents WHERE source_kind = $1 AND source_id = $2`,
        ["task", "task-embedding-on"],
      );
      expect(embeddedTexts).toEqual(["Task task-embedding-on\n\nkernel search body"]);
      expect(rows[0]?.embedding).toBe("[0.1,0.2]");
    } finally {
      if (previousFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = previousFeatures;
      await db.close();
    }
  });
});

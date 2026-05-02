import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "../../src/product-kernel/db/pglite.ts";
import { runMigrations } from "../../src/product-kernel/db/migrate.ts";
import { createLocalOrg } from "../../src/product-kernel/store/repositories.ts";
import {
  IndexerRegistry,
  SearchIndexHook,
  type SearchDocumentInput,
} from "../../src/search/indexers/base.ts";
import type { ProductDb } from "../../src/product-kernel/db/types.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-search-indexers-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

class TaskSearchIndexHook extends SearchIndexHook {
  override readonly kind = "task";

  constructor(db: ProductDb) {
    super(db);
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
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: name, name });
  return { db, org };
}

describe("P11#02 search indexer hook base", () => {
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
    const db = await openPglite(join(scratch, "org-scope"));
    try {
      await runMigrations(db);
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
});

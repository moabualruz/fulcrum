import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "../../src/product-kernel/db/pglite.ts";
import { runMigrations } from "../../src/product-kernel/db/migrate.ts";
import { createLocalOrg, createProject, createTask } from "../../src/product-kernel/store/repositories.ts";
import { DocumentIndexer, MemoryIndexer, TaskIndexer } from "../../src/search/indexers/index.ts";
import { newUlid } from "../../src/product-kernel/ids.ts";
import type { ProductDb } from "../../src/product-kernel/db/types.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-entity-indexers-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  await extendEntityTables(db);
  const org = await createLocalOrg(db, { slug: name, name });
  const project = await createProject(db, {
    orgId: org.id,
    slug: `${name}-project`,
    name: `${name} project`,
  });
  return { db, org, project };
}

async function extendEntityTables(db: ProductDb) {
  await db.exec(`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sprint_id text;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id text;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS body_md text NOT NULL DEFAULT '';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_json jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'note';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'project';
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS importance text NOT NULL DEFAULT 'medium';
    ALTER TABLE memories ADD COLUMN IF NOT EXISTS global boolean NOT NULL DEFAULT false;
  `);
}

async function searchRow(db: ProductDb, kind: string, sourceId: string) {
  const rows = await db.query<{
    source_kind: string;
    source_id: string;
    title: string;
    body: string;
    labels: string[];
    metadata: Record<string, unknown>;
    search_vector: string | null;
  }>(
    `SELECT source_kind, source_id, title, body, labels, metadata, search_vector::text AS search_vector
       FROM search_documents
      WHERE source_kind = $1 AND source_id = $2`,
    [kind, sourceId],
  );
  return rows[0];
}

describe("P11#03 entity search indexers", () => {
  test("TaskIndexer indexes, updates, lists, and deletes task search documents", async () => {
    const { db, org, project } = await freshDb("task-indexer");
    try {
      const task = await createTask(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Ship filtered task search",
        description: "Need search over task descriptions",
        status: "in_progress",
      });
      await db.query(
        `UPDATE tasks
            SET custom_fields = $2::jsonb, sprint_id = $3
          WHERE id = $1`,
        [task.id, JSON.stringify({ customer: "Acme", estimate: 8 }), newUlid()],
      );

      const indexer = new TaskIndexer(db);
      await indexer.upsert(task.id, org.id);

      let row = await searchRow(db, "task", task.id);
      expect(row).toMatchObject({
        source_kind: "task",
        source_id: task.id,
        title: "Ship filtered task search",
        body: "Need search over task descriptions Acme 8",
        labels: [],
        metadata: {
          status: "in_progress",
          assignee_id: null,
        },
      });
      expect(row?.metadata["sprint_id"]).toBeString();
      expect(row?.search_vector).toContain("descript");
      await expect(indexer.listEntityIds(org.id)).resolves.toEqual([task.id]);

      await db.query(`UPDATE tasks SET title = $2 WHERE id = $1`, [task.id, "Retitle task search"]);
      await indexer.upsert(task.id, org.id);
      row = await searchRow(db, "task", task.id);
      expect(row?.title).toBe("Retitle task search");

      await indexer.remove(task.id, org.id);
      expect(await searchRow(db, "task", task.id)).toBeUndefined();
    } finally {
      await db.close();
    }
  });

  test("DocumentIndexer indexes, updates, lists, and deletes document search documents", async () => {
    const { db, org, project } = await freshDb("document-indexer");
    try {
      const docId = newUlid();
      await db.query(
        `INSERT INTO documents (id, org_id, project_id, kind, title, body, body_md, doc_type, scope, frontmatter)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
          docId,
          org.id,
          project.id,
          "adr",
          "Search architecture note",
          "",
          "Plain markdown search body",
          "adr",
          "project",
          JSON.stringify({ tags: ["search", "architecture"] }),
        ],
      );

      const indexer = new DocumentIndexer(db);
      await indexer.upsert(docId, org.id);

      let row = await searchRow(db, "doc", docId);
      expect(row).toMatchObject({
        source_kind: "doc",
        source_id: docId,
        title: "Search architecture note",
        body: "Plain markdown search body",
        labels: ["search", "architecture"],
        metadata: { doc_type: "adr", scope: "project" },
      });
      expect(row?.search_vector).toContain("plain");
      await expect(indexer.listEntityIds(org.id)).resolves.toEqual([docId]);

      await db.query(`UPDATE documents SET title = $2 WHERE id = $1`, [docId, "Updated architecture note"]);
      await indexer.upsert(docId, org.id);
      row = await searchRow(db, "doc", docId);
      expect(row?.title).toBe("Updated architecture note");

      await indexer.remove(docId, org.id);
      expect(await searchRow(db, "doc", docId)).toBeUndefined();
    } finally {
      await db.close();
    }
  });

  test("MemoryIndexer indexes, updates, lists, and deletes memory search documents", async () => {
    const { db, org, project } = await freshDb("memory-indexer");
    try {
      const memoryId = newUlid();
      await db.query(
        `INSERT INTO memories (id, org_id, project_id, scope, kind, key, body, tags, importance, global)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10)`,
        [
          memoryId,
          org.id,
          project.id,
          "project",
          "decision",
          "decision-search-indexes",
          "Prefer deterministic search indexes",
          "{search,deterministic}",
          "high",
          false,
        ],
      );

      const indexer = new MemoryIndexer(db);
      await indexer.upsert(memoryId, org.id);

      let row = await searchRow(db, "memory", memoryId);
      expect(row).toMatchObject({
        source_kind: "memory",
        source_id: memoryId,
        title: "decision memory",
        body: "Prefer deterministic search indexes",
        labels: ["search", "deterministic"],
        metadata: { importance: "high", scope: "project" },
      });
      expect(row?.search_vector).toContain("determinist");
      await expect(indexer.listEntityIds(org.id)).resolves.toEqual([memoryId]);

      await db.query(`UPDATE memories SET body = $2 WHERE id = $1`, [memoryId, "Updated memory body"]);
      await indexer.upsert(memoryId, org.id);
      row = await searchRow(db, "memory", memoryId);
      expect(row?.body).toBe("Updated memory body");

      await indexer.remove(memoryId, org.id);
      expect(await searchRow(db, "memory", memoryId)).toBeUndefined();
    } finally {
      await db.close();
    }
  });
});

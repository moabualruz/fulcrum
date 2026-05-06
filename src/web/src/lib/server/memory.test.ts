import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import { createLocalOrg, createProject } from "../../../../test-support/product-fixtures.ts";
import type { TestStore } from "../../../../test-support/product-fixtures.ts";
import {
  createMemoryAction,
  updateMemoryAction,
  deleteMemoryAction,
  listMemories,
  getMemory,
  type MemoryScope,
} from "./memory.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-memory-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  return { db, orgId: org.id, projectId: project.id };
}

describe("memory CRUD", () => {
  test("create → get round-trips", async () => {
    const { db, orgId, projectId } = await freshDb("create-get");
    try {
      const { id } = await createMemoryAction(db, {
        orgId,
        projectId,
        scope: "project",
        kind: "fact",
        key: "db-engine",
        body: "PGlite embedded",
      });
      expect(id).toBeTruthy();
      const mem = await getMemory(db, id, orgId);
      expect(mem).not.toBeNull();
      expect(mem!.key).toBe("db-engine");
      expect(mem!.body).toBe("PGlite embedded");
      expect(mem!.scope).toBe("project");
    } finally {
      await db.close();
    }
  });

  test("list filters by scope", async () => {
    const { db, orgId, projectId } = await freshDb("list-scope");
    try {
      await createMemoryAction(db, { orgId, projectId, scope: "project", kind: "fact", key: "k1", body: "b1" });
      await createMemoryAction(db, { orgId, projectId: null, scope: "global", kind: "fact", key: "k2", body: "b2" });
      const all = await listMemories(db, { orgId });
      expect(all.length).toBe(2);
      const proj = await listMemories(db, { orgId, scope: "project" });
      expect(proj.length).toBe(1);
      expect(proj[0]!.key).toBe("k1");
      const glob = await listMemories(db, { orgId, scope: "global" });
      expect(glob.length).toBe(1);
      expect(glob[0]!.key).toBe("k2");
    } finally {
      await db.close();
    }
  });

  test("list filters by projectId", async () => {
    const { db, orgId, projectId } = await freshDb("list-project");
    try {
      await createMemoryAction(db, { orgId, projectId, scope: "project", kind: "fact", key: "k1", body: "b1" });
      await createMemoryAction(db, { orgId, projectId: null, scope: "global", kind: "fact", key: "k2", body: "b2" });
      const proj = await listMemories(db, { orgId, projectId });
      expect(proj.length).toBe(1);
      expect(proj[0]!.key).toBe("k1");
    } finally {
      await db.close();
    }
  });

  test("list filters by kind", async () => {
    const { db, orgId, projectId } = await freshDb("list-kind");
    try {
      await createMemoryAction(db, { orgId, projectId, scope: "project", kind: "fact", key: "k1", body: "b1" });
      await createMemoryAction(db, { orgId, projectId, scope: "project", kind: "decision", key: "k2", body: "b2" });
      const facts = await listMemories(db, { orgId, kind: "fact" });
      expect(facts.length).toBe(1);
      expect(facts[0]!.kind).toBe("fact");
    } finally {
      await db.close();
    }
  });

  test("update changes scope and body", async () => {
    const { db, orgId, projectId } = await freshDb("update");
    try {
      const { id } = await createMemoryAction(db, { orgId, projectId, scope: "project", kind: "fact", key: "k1", body: "old" });
      await updateMemoryAction(db, { id, orgId, scope: "global", body: "new" });
      const mem = await getMemory(db, id, orgId);
      expect(mem!.scope).toBe("global");
      expect(mem!.body).toBe("new");
    } finally {
      await db.close();
    }
  });

  test("delete removes memory", async () => {
    const { db, orgId, projectId } = await freshDb("delete");
    try {
      const { id } = await createMemoryAction(db, { orgId, projectId, scope: "project", kind: "fact", key: "k1", body: "b1" });
      await deleteMemoryAction(db, id, orgId);
      const mem = await getMemory(db, id, orgId);
      expect(mem).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("list respects limit and offset for pagination", async () => {
    const { db, orgId, projectId } = await freshDb("pagination");
    try {
      for (let i = 0; i < 5; i++) {
        await createMemoryAction(db, { orgId, projectId, scope: "project", kind: "fact", key: `k${i}`, body: `b${i}` });
      }
      const page1 = await listMemories(db, { orgId, limit: 2, offset: 0 });
      expect(page1.length).toBe(2);
      const page2 = await listMemories(db, { orgId, limit: 2, offset: 2 });
      expect(page2.length).toBe(2);
      // No overlap
      expect(page1[0]!.id).not.toBe(page2[0]!.id);
    } finally {
      await db.close();
    }
  });
});

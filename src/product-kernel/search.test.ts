import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { runMigrations } from "./db/migrate.ts";
import { createLocalOrg, createProject } from "./store/repositories.ts";
import { indexSearchDocument, searchProductDocuments } from "./search.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-search-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("search", () => {
  test("returns FTS hits in stable score, updated_at, id order", async () => {
    const db = await openPglite(join(scratch, "search"));
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      await indexSearchDocument(db, {
        orgId: org.id,
        projectId: project.id,
        sourceKind: "task",
        sourceId: "t1",
        title: "kernel kernel kernel",
        body: "kernel description",
      });
      await indexSearchDocument(db, {
        orgId: org.id,
        projectId: project.id,
        sourceKind: "doc",
        sourceId: "d1",
        title: "kernel intro",
        body: "fulcrum overview",
      });
      await indexSearchDocument(db, {
        orgId: org.id,
        projectId: project.id,
        sourceKind: "doc",
        sourceId: "d2",
        title: "unrelated",
        body: "completely different",
      });
      const hits = await searchProductDocuments(db, "kernel", {
        orgId: org.id,
        projectId: project.id,
      });
      expect(hits).toHaveLength(2);
      expect(hits[0]?.source_id).toBe("t1"); // higher rank from title weight A
      expect(hits[1]?.source_id).toBe("d1");
    } finally {
      await db.close();
    }
  });

  test("filters by source kind", async () => {
    const db = await openPglite(join(scratch, "search-kind"));
    try {
      await runMigrations(db);
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      await indexSearchDocument(db, {
        orgId: org.id,
        projectId: project.id,
        sourceKind: "task",
        sourceId: "t1",
        title: "kernel only task",
        body: "task body",
      });
      await indexSearchDocument(db, {
        orgId: org.id,
        projectId: project.id,
        sourceKind: "doc",
        sourceId: "d1",
        title: "kernel doc",
        body: "doc body",
      });
      const hits = await searchProductDocuments(db, "kernel", {
        orgId: org.id,
        projectId: project.id,
        sourceKinds: ["doc"],
      });
      expect(hits).toHaveLength(1);
      expect(hits[0]?.source_kind).toBe("doc");
    } finally {
      await db.close();
    }
  });
});

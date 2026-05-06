import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../test-support/product-fixtures.ts";
import { createLocalOrg, createProject } from "../test-support/product-fixtures.ts";
import { indexSearchDocument } from "./search.ts";
import { suggestTitles } from "./suggest.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-suggest-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("suggestTitles", () => {
  test("returns titles matching prefix, capped at 5", async () => {
    const db = await openIsolatedStore(join(scratch, "suggest"));
    try {
      await migrateIsolatedStore(db);
      const org = await createLocalOrg(db, { slug: "o", name: "O" });
      const project = await createProject(db, { orgId: org.id, slug: "p", name: "P" });
      for (let i = 0; i < 7; i++) {
        await indexSearchDocument(db, {
          orgId: org.id,
          projectId: project.id,
          sourceKind: "task",
          sourceId: `t${i}`,
          title: `foo-item-${i}`,
          body: "body",
        });
      }
      await indexSearchDocument(db, {
        orgId: org.id,
        projectId: project.id,
        sourceKind: "doc",
        sourceId: "d1",
        title: "bar-unrelated",
        body: "body",
      });

      const suggestions = await suggestTitles(db, "foo", { orgId: org.id });
      expect(suggestions.length).toBeLessThanOrEqual(5);
      for (const s of suggestions) {
        expect(s.startsWith("foo")).toBe(true);
      }
    } finally {
      await db.close();
    }
  });

  test("filters by source kind", async () => {
    const db = await openIsolatedStore(join(scratch, "suggest-kind"));
    try {
      await migrateIsolatedStore(db);
      const org = await createLocalOrg(db, { slug: "o2", name: "O2" });
      await indexSearchDocument(db, {
        orgId: org.id,
        sourceKind: "task",
        sourceId: "t1",
        title: "alpha-task",
        body: "b",
      });
      await indexSearchDocument(db, {
        orgId: org.id,
        sourceKind: "doc",
        sourceId: "d1",
        title: "alpha-doc",
        body: "b",
      });
      const suggestions = await suggestTitles(db, "alpha", {
        orgId: org.id,
        kind: "doc",
      });
      expect(suggestions).toEqual(["alpha-doc"]);
    } finally {
      await db.close();
    }
  });
});

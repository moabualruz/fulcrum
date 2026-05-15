import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";

import { openIsolatedStore, migrateIsolatedStore, type TestStore } from "@test-support/product-workspace-fixtures.ts";
import { parseQuickFilter } from "@knowledge-workspace/application/search/quick-filter-parser.ts";
import { suggestSearchDocuments } from "@knowledge-workspace/application/search/suggest.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-search-suggest-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  return db;
}

async function insertDoc(
  db: TestStore,
  input: {
    id: string;
    orgId?: string;
    kind: string;
    entityId: string;
    title: string;
  },
) {
  await db.query(
    `INSERT INTO search_documents
       (id, org_id, source_kind, source_id, title, body)
     VALUES ($1, $2, $3, $4, $5, '')`,
    [input.id, input.orgId ?? "org-search", input.kind, input.entityId, input.title],
  );
}

describe("search suggest", () => {
  test("partial token returns top five matching titles across kinds", async () => {
    const db = await freshDb("top-five");
    try {
      for (const [index, title, kind] of [
        [1, "foo alpha", "doc"],
        [2, "foo beta", "task"],
        [3, "foo delta", "memory"],
        [4, "foo epsilon", "run"],
        [5, "foo gamma", "artifact"],
        [6, "foo zeta", "repo"],
        [7, "bar outside", "doc"],
      ] as const) {
        await insertDoc(db, { id: `doc-${index}`, kind, entityId: `entity-${index}`, title });
      }

      const result = await suggestSearchDocuments(db, { orgId: "org-search", prefix: "foo" });

      expect(result).toEqual({
        suggestions: ["foo alpha", "foo beta", "foo delta", "foo epsilon", "foo gamma"],
      });
    } finally {
      await db.close();
    }
  });

  test("kind scope filters suggestions", async () => {
    const db = await freshDb("kind-scope");
    try {
      await insertDoc(db, { id: "task-hit", kind: "task", entityId: "task-1", title: "foo task" });
      await insertDoc(db, { id: "doc-hit", kind: "doc", entityId: "doc-1", title: "foo doc" });

      const result = await suggestSearchDocuments(db, {
        orgId: "org-search",
        prefix: "foo",
        kind: "task",
      });

      expect(result).toEqual({ suggestions: ["foo task"] });
    } finally {
      await db.close();
    }
  });
});

describe("quick-filter parser", () => {
  test("extracts a leading kind token and cleans remaining query", () => {
    expect(parseQuickFilter("kind:doc foo bar")).toEqual({
      cleanQuery: "foo bar",
      filters: { kind: "doc" },
    });
  });

  test("extracts combined leading tokens, maps project slug and assignee me, and preserves text", () => {
    expect(parseQuickFilter("kind:task project:agent-os assignee:me status:open tag:p11 foo bar")).toEqual({
      cleanQuery: "foo bar",
      filters: {
        kind: "task",
        projectSlug: "agent-os",
        assignee: "$me",
        status: "open",
        tags: ["p11"],
      },
    });
  });

  test("ignores unknown filter keys without stripping them", () => {
    expect(parseQuickFilter("owner:mkh kind:doc foo")).toEqual({
      cleanQuery: "owner:mkh kind:doc foo",
      filters: {},
    });
  });
});

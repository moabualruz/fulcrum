import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import { indexSearchDocument } from "@/test-support/product-fixtures.ts";
import { createLocalOrg } from "@/test-support/product-fixtures.ts";

// Provide $lib/server/db using the test scratch database
mock.module("$lib/server/db", () => {
  const { join: j } = require("node:path");
  const { openIsolatedStore: oP } = require("../../../../test-support/product-fixtures.ts");
  const { migrateIsolatedStore: rM } = require("../../../../test-support/product-fixtures.ts");
  return {
    openIsolatedStore: async () => {
      const scratch = process.env["FULCRUM_HOME"]!;
      const dbDir = j(scratch, "state", "product", "db");
      const { mkdirSync: mk } = require("node:fs");
      mk(dbDir, { recursive: true });
      const db = await oP(j(dbDir, "main"));
      await rM(db);
      return db;
    },
    getDefaultOrgId: async (db: { query: <T>(sql: string, p: unknown[]) => Promise<T[]> }) => {
      const rows = await db.query<{ id: string }>(`SELECT id FROM orgs WHERE slug = $1`, ["default"]);
      return rows[0]?.id ?? null;
    },
  };
});

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-search-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

function eventFor(query: string, extra: Record<string, string> = {}): Parameters<typeof import("./+page.server.ts").load>[0] {
  const url = new URL("http://localhost/search");
  if (query.length > 0) url.searchParams.set("q", query);
  for (const [k, v] of Object.entries(extra)) {
    url.searchParams.set(k, v);
  }
  return { url } as Parameters<typeof import("./+page.server.ts").load>[0];
}

async function seedSearchIndex(): Promise<{ orgId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  try {
    await migrateIsolatedStore(db);
    const org = await createLocalOrg(db, { slug: "default", name: "Default" });
    await indexSearchDocument(db, {
      orgId: org.id,
      sourceKind: "doc",
      sourceId: "doc-1",
      title: "Kernel notes",
      body: "Fulcrum kernel search notes",
    });
    await indexSearchDocument(db, {
      orgId: org.id,
      sourceKind: "task",
      sourceId: "task-1",
      title: "Kernel task",
      body: "Wire grouped search",
    });
    await indexSearchDocument(db, {
      orgId: org.id,
      sourceKind: "memory",
      sourceId: "memory-1",
      title: "Memory lane",
      body: "Unrelated entry",
    });
    return { orgId: org.id };
  } finally {
    await db.close();
  }
}

describe("/search +page.server.ts load()", () => {
  test("empty q returns an empty search model", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(eventFor("   "));
    expect(result).toMatchObject({ q: "", hits: [], grouped: {} });
  });

  test("q matching doc and task groups hits by source_kind", async () => {
    await seedSearchIndex();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load(eventFor("kernel"));
    expect(result.grouped.doc).toHaveLength(1);
    expect(result.grouped.task).toHaveLength(1);
  });

  test("q with no matches returns empty hits and grouped", async () => {
    await seedSearchIndex();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load(eventFor("nomatch"));
    expect(result.hits).toHaveLength(0);
    expect(result.grouped).toEqual({});
  });

  test("kind facet filters to doc only", async () => {
    await seedSearchIndex();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load(eventFor("kernel", { kinds: "doc" }));
    expect(result.grouped.doc).toHaveLength(1);
    expect(result.grouped.task).toBeUndefined();
  });

  test("savedSearches array is always returned", async () => {
    await seedSearchIndex();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.load(eventFor(""));
    expect(Array.isArray(result.savedSearches)).toBe(true);
  });

  test("fts returns results across 3+ kinds", async () => {
    await seedSearchIndex();
    // Add a third kind that matches 'kernel'
    const dbDir = join(scratch, "state", "product", "db");
    const db = await openIsolatedStore(join(dbDir, "main"));
    try {
      const orgRows = await db.query<{ id: string }>(`SELECT id FROM orgs WHERE slug = $1`, ["default"]);
      const orgId = orgRows[0]!.id;
      await indexSearchDocument(db, {
        orgId,
        sourceKind: "memory",
        sourceId: "memory-kernel",
        title: "Kernel memory",
        body: "kernel concept stored here",
      });
    } finally {
      await db.close();
    }
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    const result = await mod.load(eventFor("kernel"));
    const kinds = Object.keys(result.grouped);
    expect(kinds.length).toBeGreaterThanOrEqual(3);
  });
});

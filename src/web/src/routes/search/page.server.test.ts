import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { indexSearchDocument } from "../../../../product-kernel/search.ts";
import { createLocalOrg } from "../../../../product-kernel/store/repositories.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-search-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

function eventFor(query: string): Parameters<typeof import("./+page.server.ts").load>[0] {
  const url = new URL("http://localhost/search");
  if (query.length > 0) url.searchParams.set("q", query);
  return { url } as Parameters<typeof import("./+page.server.ts").load>[0];
}

async function seedSearchIndex(): Promise<void> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  try {
    await runMigrations(db);
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
  } finally {
    await db.close();
  }
}

describe("/search +page.server.ts load()", () => {
  test("empty q returns an empty search model", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(eventFor("   "));
    expect(result).toEqual({ q: "", hits: [], grouped: {} });
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
});

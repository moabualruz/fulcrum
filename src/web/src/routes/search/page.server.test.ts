import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import { indexSearchDocument } from "../../../../product-kernel/search.ts";
import type { SearchHit } from "../../../../product-kernel/search.ts";
import { createLocalOrg, createProject } from "../../../../product-kernel/store/repositories.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-search-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

function eventFor(query: string, params: Record<string, string> = {}): Parameters<typeof import("./+page.server.ts").load>[0] {
  const url = new URL("http://localhost/search");
  if (query.length > 0) url.searchParams.set("q", query);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return { url } as Parameters<typeof import("./+page.server.ts").load>[0];
}

async function seedSearchIndex(): Promise<{ projectId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  let projectId = "";
  try {
    await runMigrations(db);
    const org = await createLocalOrg(db, { slug: "default", name: "Default" });
    const project = await createProject(db, { orgId: org.id, slug: "search", name: "Search" });
    projectId = project.id;
    await indexSearchDocument(db, {
      orgId: org.id,
      projectId: project.id,
      sourceKind: "doc",
      sourceId: "doc-1",
      title: "Kernel notes",
      body: "Fulcrum kernel search notes",
      labels: ["architecture"],
    });
    await db.query(
      `UPDATE search_documents
          SET metadata = $1::jsonb, updated_at = $2::timestamptz
        WHERE org_id = $3 AND source_kind = 'doc' AND source_id = 'doc-1'`,
      [JSON.stringify({ status: "open", assignee_id: "ada", author_id: "grace" }), "2026-04-30T10:00:00.000Z", org.id],
    );
    await indexSearchDocument(db, {
      orgId: org.id,
      sourceKind: "task",
      sourceId: "task-1",
      title: "Kernel task",
      body: "Wire grouped search",
      labels: ["implementation"],
    });
    await db.query(
      `UPDATE search_documents
          SET metadata = $1::jsonb, updated_at = $2::timestamptz
        WHERE org_id = $3 AND source_kind = 'task' AND source_id = 'task-1'`,
      [JSON.stringify({ status: "done", assignee_id: "linus", author_id: "grace" }), "2026-04-29T10:00:00.000Z", org.id],
    );
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
  return { projectId };
}

describe("/search +page.server.ts load()", () => {
  test("empty q returns an empty search model", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(eventFor("   "));
    expect(result).toMatchObject({ q: "", hits: [], grouped: {} });
    expect(result.pagination).toEqual({ page: 1, perPage: 20, total: 0, hasMore: false });
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

  test("hydrates URL params into facets and filters kind/project/status/assignee/tag/date/author", async () => {
    const { projectId } = await seedSearchIndex();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load(eventFor("kernel", {
      kind: "doc",
      project: projectId,
      status: "open",
      assignee: "ada",
      tag: "architecture",
      date_from: "2026-04-30",
      date_to: "2026-05-01",
      author: "grace",
    }));

    expect(result.params).toEqual({
      q: "kernel",
      kind: "doc",
      project: projectId,
      status: "open",
      assignee: "ada",
      tag: "architecture",
      date_from: "2026-04-30",
      date_to: "2026-05-01",
      author: "grace",
      page: 1,
    });
    expect(result.hits.map((hit: SearchHit) => hit.source_kind)).toEqual(["doc"]);
    expect(result.grouped.doc).toHaveLength(1);
  });

  test("returns facet count badges and hasMore for paginated results", async () => {
    await seedSearchIndex();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.load(eventFor("kernel", { per_page: "1" }));

    expect(result.facets.kind.doc).toBe(1);
    expect(result.facets.kind.task).toBe(1);
    expect(result.pagination).toEqual({ page: 1, perPage: 1, total: 2, hasMore: true });
    expect(result.hits).toHaveLength(1);
  });
});

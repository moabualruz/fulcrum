import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg, createProject } from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";
import { closeDatabase } from "$lib/server/db";
import { applicationScopeMock } from "$lib/test/application-scope-mock";

// `+page.server.ts` resolves the application scope through
// `requestServiceScope`. We seed an isolated PGlite store and inject it as the
// scope's `em`, then assert the route returns the seeded projects in
// deterministic `created_at`-ASC order.

let scratch: string;
let activeDb: TestStore | null = null;
let activeOrgId = "";

// `applicationScopeMock` keeps a complete export set (so sibling suites that
// import `__setApplicationScopeForTest` still resolve it) and routes foreign
// suites through the real scope resolver.
mock.module("$lib/server/application-scope", () =>
  applicationScopeMock((_locals, projectId) =>
    activeDb
      ? {
          em: activeDb,
          ctx: { orgId: activeOrgId, userId: null, projectId: projectId ?? null },
        }
      : null,
  ),
);

interface ProjectPayload {
  projects: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    updated_at: string;
  }>;
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-projects-list-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(async () => {
  await activeDb?.close().catch(() => {});
  activeDb = null;
  activeOrgId = "";
  await closeDatabase();
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function freshDb(): Promise<TestStore> {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  activeDb = db;
  return db;
}

async function seedTwoProjects(): Promise<{ orgId: string; first: string; second: string }> {
  const db = await freshDb();
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  activeOrgId = org.id;
  const first = await createProject(db, {
    orgId: org.id,
    slug: "first",
    name: "First",
    description: "earlier project",
  });
  // Pin both rows' `created_at` so the ASC ordering assertion is invariant
  // across PGlite's clock granularity (otherwise sub-millisecond inserts can
  // collide and the secondary `id ASC` tie-break dominates).
  await db.query(`UPDATE projects SET created_at = $2 WHERE id = $1`, [
    first.id,
    "2026-04-01T00:00:00.000Z",
  ]);
  const second = await createProject(db, {
    orgId: org.id,
    slug: "second",
    name: "Second",
    description: null,
  });
  await db.query(`UPDATE projects SET created_at = $2 WHERE id = $1`, [
    second.id,
    "2026-04-02T00:00:00.000Z",
  ]);
  return { orgId: org.id, first: first.id, second: second.id };
}

describe("/projects +page.server.ts load()", () => {
  test("returns seeded projects in deterministic created_at-ASC order", async () => {
    const { first, second } = await seedTwoProjects();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      locals: { activeProjectId: "first" },
    } as Parameters<typeof mod.load>[0]);
    expect(result.activeProjectId).toBe("first");
    const payload = await streamedData<ProjectPayload>(result);
    expect(Array.isArray(payload.projects)).toBe(true);
    expect(payload.projects).toHaveLength(2);
    expect(payload.projects[0]?.id).toBe(first);
    expect(payload.projects[1]?.id).toBe(second);
    expect(payload.projects[0]?.slug).toBe("first");
    expect(payload.projects[1]?.slug).toBe("second");
  });

  test("returns empty array when the product DB has no projects", async () => {
    // Initialise an empty DB so the route resolves a scope but finds no rows.
    await freshDb();
    const org = await createLocalOrg(activeDb as TestStore, { slug: "default", name: "Default" });
    activeOrgId = org.id;
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    expect(result.activeProjectId).toBeNull();
    const payload = await streamedData<ProjectPayload>(result);
    expect(payload.projects).toEqual([]);
  });
});

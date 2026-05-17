import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg, createProject } from "@test-support/product-workspace-fixtures.ts";

// The route uses the configured default PGlite data directory. We seed two
// projects there with controlled `created_at` timestamps so ordering stays
// deterministic.

let scratch: string;

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

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedTwoProjects(): Promise<{ orgId: string; first: string; second: string }> {
  const db = await openIsolatedStore(join(scratch, "pglite.data"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
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
  await db.close();
  return { orgId: org.id, first: first.id, second: second.id };
}

describe("/projects +page.server.ts load()", () => {
  test("returns seeded projects in deterministic created_at-ASC order", async () => {
    const { orgId, first, second } = await seedTwoProjects();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      locals: { activeProjectId: "first", orgId },
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
    // Initialise an empty DB at the expected path so the route does not crash.
    const db = await openIsolatedStore(join(scratch, "pglite.data"));
    await migrateIsolatedStore(db);
    await db.close();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    expect(result.activeProjectId).toBeNull();
    const payload = await streamedData<ProjectPayload>(result);
    expect(payload.projects).toEqual([]);
  });
});

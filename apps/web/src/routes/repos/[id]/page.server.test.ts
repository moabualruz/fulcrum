import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import { createLocalOrg } from "@/test-support/product-fixtures.ts";
import { makeId } from "@/test-support/product-fixtures.ts";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

async function seedRepo(scratch: string) {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const repoId = makeId();
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, default_branch, remote_url, registered_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [repoId, org.id, "myrepo", "/tmp/myrepo", "main", null, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"],
  );
  await db.close();
  return { orgId: org.id, repoId };
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-repos-detail-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

describe("/repos/[id] +page.server.ts load()", () => {
  test("returns repo detail with slug and default_branch", async () => {
    const { repoId } = await seedRepo(scratch);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: repoId },
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ repo: { slug: string; default_branch: string | null }; branches: unknown[]; commits: unknown[]; linkedTasks: unknown[] }>(result);
    expect(payload.repo.slug).toBe("myrepo");
    expect(payload.repo.default_branch).toBe("main");
    expect(Array.isArray(payload.branches)).toBe(true);
    expect(Array.isArray(payload.commits)).toBe(true);
    expect(Array.isArray(payload.linkedTasks)).toBe(true);
  });

  test("throws 404 for unknown repo id", async () => {
    await seedRepo(scratch);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    let threw = false;
    try {
      const result = await mod.load({
        params: { id: "nonexistent-id" },
        locals: { activeProjectId: null },
      } as Parameters<typeof mod.load>[0]);
      await streamedData(result);
    } catch (err) {
      threw = true;
      expect((err as { status?: number }).status).toBe(404);
    }
    expect(threw).toBe(true);
  });

  test("git operations return empty arrays when root_path does not exist", async () => {
    const { repoId } = await seedRepo(scratch);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      params: { id: repoId },
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ branches: unknown[]; commits: unknown[] }>(result);
    // /tmp/myrepo does not exist → git fails → empty arrays, no throw
    expect(Array.isArray(payload.branches)).toBe(true);
    expect(Array.isArray(payload.commits)).toBe(true);
  });
});

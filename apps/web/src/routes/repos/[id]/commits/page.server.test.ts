import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg } from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";
import { _PAGE_SIZE } from "./+page.server.ts";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

async function seedRepo(scratch: string, rootPath: string) {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const repoId = makeId();
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, default_branch, remote_url, registered_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [repoId, org.id, "commitrepo", rootPath, "main", null, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"],
  );
  await db.close();
  return { repoId };
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-repos-commits-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

describe("/repos/[id]/commits +page.server.ts", () => {
  test("PAGE_SIZE constant is 50", () => {
    expect(_PAGE_SIZE).toBe(50);
  });

  test("returns empty commits when git repo does not exist", async () => {
    const { repoId } = await seedRepo(scratch, "/nonexistent-git-dir");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: repoId },
      url: new URL("http://localhost/repos/x/commits"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ commits: unknown[]; total: number; page: number; totalPages: number }>(result);
    expect(payload.commits).toEqual([]);
    expect(payload.total).toBe(0);
    expect(payload.page).toBe(1);
    expect(payload.totalPages).toBe(1);
  });

  test("throws 404 for unknown repo id", async () => {
    await seedRepo(scratch, "/tmp/x");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    let threw = false;
    try {
      const result = await mod.load({
        params: { id: "no-such-id" },
        url: new URL("http://localhost/repos/x/commits"),
        locals: { activeProjectId: null },
      } as Parameters<typeof mod.load>[0]);
      await streamedData(result);
    } catch (err) {
      threw = true;
      expect((err as { status?: number }).status).toBe(404);
    }
    expect(threw).toBe(true);
  });

  test("reads commits from a real git repo with pagination", async () => {
    // Use the fulcrum repo root itself
    const repoRoot = join(import.meta.dir, "../../../../../../..");
    const { repoId } = await seedRepo(scratch, repoRoot);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      params: { id: repoId },
      url: new URL("http://localhost/repos/x/commits?page=1"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{
      commits: Array<{ sha: string; shortSha: string; author: string; email: string; date: string; message: string }>;
      total: number;
      page: number;
      totalPages: number;
    }>(result);

    expect(payload.commits.length).toBeGreaterThan(0);
    expect(payload.commits.length).toBeLessThanOrEqual(_PAGE_SIZE);
    expect(payload.total).toBeGreaterThan(0);
    expect(payload.page).toBe(1);

    // Validate structure: 8-char shortSha, monospace-friendly
    const c = payload.commits[0]!;
    expect(c.shortSha).toHaveLength(8);
    expect(c.sha).toHaveLength(40);
    expect(typeof c.author).toBe("string");
    expect(typeof c.email).toBe("string");
    expect(typeof c.message).toBe("string");
  });

  test("respects page param and returns correct slice", async () => {
    const repoRoot = join(import.meta.dir, "../../../../../../..");
    const { repoId } = await seedRepo(scratch, repoRoot);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);

    const result1 = await mod.load({
      params: { id: repoId },
      url: new URL("http://localhost/repos/x/commits?page=1"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const result2 = await mod.load({
      params: { id: repoId },
      url: new URL("http://localhost/repos/x/commits?page=2"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);

    const [p1, p2] = await Promise.all([
      streamedData<{ commits: Array<{ sha: string }> }>(result1),
      streamedData<{ commits: Array<{ sha: string }> }>(result2),
    ]);

    // Pages should be disjoint (different SHAs)
    if (p1.commits.length > 0 && p2.commits.length > 0) {
      expect(p1.commits[0]?.sha).not.toBe(p2.commits[0]?.sha);
    }
  });
});

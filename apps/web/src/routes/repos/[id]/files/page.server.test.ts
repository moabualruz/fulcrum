import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg } from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";

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
    [repoId, org.id, "filesrepo", rootPath, "main", null, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"],
  );
  await db.close();
  return { repoId };
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-repos-files-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

describe("/repos/[id]/files +page.server.ts load()", () => {
  test("returns empty tree when root_path has no git repo", async () => {
    const { repoId } = await seedRepo(scratch, "/nonexistent-git-dir");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: repoId },
      url: new URL("http://localhost/repos/x/files"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ tree: unknown[]; filePath: string; fileContent: null; isBinary: boolean }>(result);
    expect(Array.isArray(payload.tree)).toBe(true);
    expect(payload.filePath).toBe("");
    expect(payload.fileContent).toBeNull();
    expect(payload.isBinary).toBe(false);
  });

  test("reports binary=true for known binary extensions without throwing", async () => {
    const { repoId } = await seedRepo(scratch, "/nonexistent-git-dir");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      params: { id: repoId },
      url: new URL("http://localhost/repos/x/files?path=image.png"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ isBinary: boolean; fileContent: null }>(result);
    expect(payload.isBinary).toBe(true);
    expect(payload.fileContent).toBeNull();
  });

  test("throws 404 for unknown repo id", async () => {
    await seedRepo(scratch, "/tmp/x");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    let threw = false;
    try {
      const result = await mod.load({
        params: { id: "no-such-id" },
        url: new URL("http://localhost/repos/x/files"),
        locals: { activeProjectId: null },
      } as Parameters<typeof mod.load>[0]);
      await streamedData(result);
    } catch (err) {
      threw = true;
      expect((err as { status?: number }).status).toBe(404);
    }
    expect(threw).toBe(true);
  });

  test("lists files from a real git repo", async () => {
    // Use the fulcrum repo root itself as the git dir
    const repoRoot = join(import.meta.dir, "../../../../../../..");
    const { repoId } = await seedRepo(scratch, repoRoot);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const result = await mod.load({
      params: { id: repoId },
      url: new URL("http://localhost/repos/x/files"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ tree: Array<{ kind: string; name: string; path: string }> }>(result);
    expect(payload.tree.length).toBeGreaterThan(0);
    // Confirm we get dirs and/or files from the root
    const names = payload.tree.map((n) => n.name);
    expect(names).toContain("src");
  });
});

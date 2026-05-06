import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../../test-support/product-fixtures.ts";
import { createLocalOrg } from "../../../../test-support/product-fixtures.ts";
import { makeId } from "../../../../test-support/product-fixtures.ts";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

async function seedDb(scratch: string) {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });

  const r1 = makeId();
  const r2 = makeId();
  const r3 = makeId();

  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, default_branch, remote_url, registered_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [r1, org.id, "alpha", "/tmp/alpha", "main", null, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"],
  );
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, default_branch, remote_url, registered_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [r2, org.id, "beta", "/tmp/beta", "main", null, "2026-01-02T00:00:00Z", "2026-01-03T00:00:00Z"],
  );
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, default_branch, remote_url, registered_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [r3, org.id, "gamma", "/tmp/gamma", null, null, "2026-01-03T00:00:00Z", "2026-01-04T00:00:00Z"],
  );

  await db.close();
  return { orgId: org.id, r1, r2, r3 };
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-repos-list-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

interface ReposPayload {
  repos: Array<{
    id: string;
    slug: string;
    root_path: string;
    default_branch: string | null;
    remote_url: string | null;
    registered_at: string;
    last_seen_at: string;
    project_id: string | null;
  }>;
}

describe("/repos +page.server.ts load()", () => {
  test("returns 3 seeded repos in registered_at ASC order", async () => {
    const { r1, r2, r3 } = await seedDb(scratch);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ReposPayload>(result);
    expect(payload.repos).toHaveLength(3);
    expect(payload.repos[0]?.id).toBe(r1);
    expect(payload.repos[1]?.id).toBe(r2);
    expect(payload.repos[2]?.id).toBe(r3);
    expect(payload.repos[0]?.slug).toBe("alpha");
  });

  test("returns empty array when no repos registered", async () => {
    const dbDir = join(scratch, "state", "product", "db");
    mkdirSync(dbDir, { recursive: true });
    const db = await openIsolatedStore(join(dbDir, "main"));
    await migrateIsolatedStore(db);
    await createLocalOrg(db, { slug: "default", name: "Default" });
    await db.close();

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ReposPayload>(result);
    expect(payload.repos).toEqual([]);
  });

  test("repo row includes last_seen_at as ISO string", async () => {
    await seedDb(scratch);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ReposPayload>(result);
    expect(typeof payload.repos[0]?.last_seen_at).toBe("string");
    expect(payload.repos[0]?.last_seen_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("/repos +page.server.ts sync action()", () => {
  test("updates last_seen_at for the target repo", async () => {
    const { r1 } = await seedDb(scratch);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);

    const form = new FormData();
    form.set("repo_id", r1);
    const before = new Date("2026-01-02T00:00:00Z").getTime();

    await mod.actions.sync({ request: { formData: async () => form } } as Parameters<typeof mod.actions.sync>[0]);

    // Verify update by re-loading
    const result2 = await mod.load({
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload2 = await streamedData<ReposPayload>(result2);
    const updated = payload2.repos.find((r) => r.id === r1);
    expect(updated).toBeDefined();
    const updatedMs = new Date(updated!.last_seen_at).getTime();
    expect(updatedMs).toBeGreaterThan(before);
  });
});

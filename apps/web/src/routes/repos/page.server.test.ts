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

async function seedDb(scratch: string) {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  await ensureRepoReadModels(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });

  const r1 = makeId();
  const r2 = makeId();
  const r3 = makeId();

  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, local_path, current_branch, default_branch, remote_url, registered_at, last_seen_at, last_sync_at, last_touched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      r1,
      org.id,
      "alpha",
      "/tmp/alpha",
      "/tmp/alpha",
      "main",
      "main",
      null,
      "2026-01-01T00:00:00Z",
      "2026-01-02T00:00:00Z",
      "2026-01-02T00:00:00Z",
      "2026-01-04T00:00:00Z",
    ],
  );
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, local_path, current_branch, default_branch, remote_url, registered_at, last_seen_at, last_sync_at, last_touched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      r2,
      org.id,
      "beta",
      "/tmp/beta",
      "/tmp/beta",
      "main",
      "main",
      null,
      "2026-01-02T00:00:00Z",
      "2026-01-03T00:00:00Z",
      "2026-01-03T00:00:00Z",
      "2026-01-03T00:00:00Z",
    ],
  );
  await db.query(
    `INSERT INTO repos (id, org_id, slug, root_path, local_path, current_branch, default_branch, remote_url, registered_at, last_seen_at, last_sync_at, last_touched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      r3,
      org.id,
      "gamma",
      "/tmp/gamma",
      "/tmp/gamma",
      null,
      null,
      null,
      "2026-01-03T00:00:00Z",
      "2026-01-04T00:00:00Z",
      "2026-01-04T00:00:00Z",
      "2026-01-02T00:00:00Z",
    ],
  );

  await db.close();
  return { orgId: org.id, r1, r2, r3 };
}

async function ensureRepoReadModels(db: { query(sql: string, params?: unknown[]): Promise<unknown> }) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS repo_commits (
      id text PRIMARY KEY,
      org_id text NOT NULL,
      repo_id text NOT NULL,
      sha text NOT NULL,
      message text,
      author text,
      committed_at timestamptz
    )
  `);
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
    path: string | null;
    remoteUrl: string | null;
    branch: string | null;
    dirty: boolean;
    lastSyncAt: string | null;
    recentCommit: string | null;
    openTaskCount: number;
    health: string;
  }>;
}

describe("/repos +page.server.ts load()", () => {
  test("returns 3 seeded repos in last_touched_at DESC order", async () => {
    const { orgId, r1, r2, r3 } = await seedDb(scratch);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      locals: { activeProjectId: null, orgId },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ReposPayload>(result);
    expect(payload.repos).toHaveLength(3);
    expect(payload.repos[0]?.id).toBe(r1);
    expect(payload.repos[1]?.id).toBe(r2);
    expect(payload.repos[2]?.id).toBe(r3);
    expect(payload.repos[0]?.slug).toBe("alpha");
  });

  test("returns empty array when no repos registered", async () => {
    const dbDir = join(scratch, "pglite.data");
    mkdirSync(dbDir, { recursive: true });
    const db = await openIsolatedStore(dbDir);
    await migrateIsolatedStore(db);
    await ensureRepoReadModels(db);
    const org = await createLocalOrg(db, { slug: "default", name: "Default" });
    await db.close();

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      locals: { activeProjectId: null, orgId: org.id },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ReposPayload>(result);
    expect(payload.repos).toEqual([]);
  });

  test("repo row includes lastSyncAt as ISO string", async () => {
    const { orgId } = await seedDb(scratch);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      locals: { activeProjectId: null, orgId },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<ReposPayload>(result);
    expect(typeof payload.repos[0]?.lastSyncAt).toBe("string");
    expect(payload.repos[0]?.lastSyncAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("/repos +page.server.ts sync action()", () => {
  test("queues sync through the repository public API", async () => {
    const r1 = makeId();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const form = new FormData();
    form.set("repo_id", r1);
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    const result = await mod.actions.sync({
      request: {
        headers: new Headers({ cookie: "sid=repo-list" }),
        formData: async () => form,
      },
      locals: { activeProjectId: null, orgId: "org-repos", session: {}, em: null, container: null },
      url: new URL("http://localhost/repos"),
      fetch: async (url, init) => {
        const target = url.toString();
        if (target.includes("/api/trpc")) throw new Error("unexpected runtime route call");
        calls.push({ url: target, init });
        return Response.json({ id: r1 }, { status: 202 });
      },
    } as Parameters<typeof mod.actions.sync>[0]);

    expect(result).toEqual({ ok: true, message: "Repo sync queued" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`http://localhost/api/v1/repos/${r1}/sync?orgId=org-repos`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.credentials).toBe("include");
    expect((calls[0]?.init?.headers as Record<string, string>)?.cookie).toBe("sid=repo-list");
  });
});

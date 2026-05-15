import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg } from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";
import {
  configureRepoDashboardService,
  type RepoDashboardService,
} from "@integration-hub/application/repos/dashboard.ts";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

async function seedRepo(scratch: string) {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
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
  configureRepoDashboardService(null);
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

function configureRepoDetailService(repoId: string): void {
  const service: RepoDashboardService = {
    async getRepoDashboard() {
      return [{
        id: repoId,
        path: "/tmp/myrepo",
        branch: "main",
        dirty: false,
        openTaskCount: 0,
        health: "healthy",
        watcherStatus: "unknown",
        syncLatencyMs: null,
        lastSyncError: null,
      }];
    },
    async getRepoDetail() {
      return { branches: [], commits: [], files: [], syncLog: [] };
    },
  };
  configureRepoDashboardService(service);
}

describe("/repos/[id] +page.server.ts load()", () => {
  test("returns repo detail with path and branch", async () => {
    const { repoId } = await seedRepo(scratch);
    configureRepoDetailService(repoId);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: repoId },
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ repo: { path: string; branch: string | null }; branches: unknown[]; commits: unknown[]; files: unknown[]; syncLog: unknown[] }>(result);
    expect(payload.repo.path).toBe("/tmp/myrepo");
    expect(payload.repo.branch).toBe("main");
    expect(Array.isArray(payload.branches)).toBe(true);
    expect(Array.isArray(payload.commits)).toBe(true);
    expect(Array.isArray(payload.files)).toBe(true);
    expect(Array.isArray(payload.syncLog)).toBe(true);
  });

  test("throws 404 for unknown repo id", async () => {
    const { repoId } = await seedRepo(scratch);
    configureRepoDetailService(repoId);
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
    configureRepoDetailService(repoId);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      params: { id: repoId },
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ branches: unknown[]; commits: unknown[] }>(result);
    expect(Array.isArray(payload.branches)).toBe(true);
    expect(Array.isArray(payload.commits)).toBe(true);
  });
});

describe("/repos/[id] +page.server.ts sync action()", () => {
  test("queues repo sync through the repository public API", async () => {
    const repoId = makeId();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    const result = await mod.actions.sync({
      params: { id: repoId },
      request: { headers: new Headers({ cookie: "sid=repo-detail" }) },
      locals: { activeProjectId: null, orgId: "org-repos", session: {}, em: null, container: null },
      url: new URL(`http://localhost/repos/${repoId}`),
      fetch: async (url, init) => {
        const target = url.toString();
        if (target.includes("/api/trpc")) throw new Error("unexpected runtime route call");
        calls.push({ url: target, init });
        return Response.json({ id: repoId }, { status: 202 });
      },
    } as Parameters<typeof mod.actions.sync>[0]);

    expect(result).toEqual({ ok: true, message: "Repo sync queued" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`http://localhost/api/v1/repos/${repoId}/sync?orgId=org-repos`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.credentials).toBe("include");
    expect((calls[0]?.init?.headers as Record<string, string>)?.cookie).toBe("sid=repo-detail");
  });
});

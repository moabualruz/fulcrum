import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

interface DashboardRow {
  id: string;
  path: string;
  remoteUrl?: string | null;
  branch?: string | null;
  dirty: boolean;
  lastSyncAt?: string | null;
  recentCommit?: string | null;
  openTaskCount: number;
  health: string;
  watcherStatus: string;
  syncLatencyMs: number | null;
  lastSyncError: string | null;
}

const repos: DashboardRow[] = [];
const detail = {
  branches: [] as Array<{ name: string; updatedAt: Date }>,
  commits: [] as Array<{ sha: string; committedAt: Date }>,
  files: [] as Array<{ path: string; updatedAt: Date }>,
  syncLog: [] as Array<{ status: string; createdAt: Date }>,
};

function row(overrides: Partial<DashboardRow> = {}): DashboardRow {
  return {
    id: "repo-1",
    path: "/tmp/myrepo",
    branch: "main",
    dirty: false,
    openTaskCount: 0,
    health: "healthy",
    watcherStatus: "unknown",
    syncLatencyMs: null,
    lastSyncError: null,
    ...overrides,
  };
}

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

mock.module("@integration-hub/interface/repository-pages.ts", () => ({
  listRepositoryDashboard: async () => [...repos],
  loadRepositoryDetail: async () => ({
    branches: [...detail.branches],
    commits: [...detail.commits],
    files: [...detail.files],
    syncLog: [...detail.syncLog],
  }),
}));

beforeEach(() => {
  repos.splice(0, repos.length);
  detail.branches.splice(0, detail.branches.length);
  detail.commits.splice(0, detail.commits.length);
  detail.files.splice(0, detail.files.length);
  detail.syncLog.splice(0, detail.syncLog.length);
});

describe("/repos/[id] +page.server.ts", () => {
  test("server route uses the repository interface instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@integration-hub/interface/repository-pages");
    expect(source).not.toContain("@integration-hub/application/repos");
  });

  test("load returns repo detail with ISO-normalized detail rows", async () => {
    repos.push(row({ id: "repo-1", path: "/tmp/myrepo", branch: "main" }));
    detail.branches.push({ name: "main", updatedAt: new Date("2026-01-01T00:00:00Z") });
    detail.commits.push({ sha: "abcdef123456", committedAt: new Date("2026-01-02T00:00:00Z") });
    detail.files.push({ path: "src/main.ts", updatedAt: new Date("2026-01-03T00:00:00Z") });
    detail.syncLog.push({ status: "ok", createdAt: new Date("2026-01-04T00:00:00Z") });

    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: "repo-1" },
      locals: { activeProjectId: null, orgId: "org-1" },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{
      repo: { path: string; branch: string | null };
      branches: Array<{ updatedAt?: string }>;
      commits: Array<{ committedAt?: string }>;
      files: Array<{ updatedAt?: string }>;
      syncLog: Array<{ createdAt?: string }>;
    }>(result);

    expect(payload.repo.path).toBe("/tmp/myrepo");
    expect(payload.repo.branch).toBe("main");
    expect(payload.branches[0]?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(payload.commits[0]?.committedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(payload.files[0]?.updatedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(payload.syncLog[0]?.createdAt).toBe("2026-01-04T00:00:00.000Z");
  });

  test("throws 404 for unknown repo id", async () => {
    repos.push(row({ id: "repo-known" }));
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    await expect(async () => {
      const result = await mod.load({
        params: { id: "repo-missing" },
        locals: { activeProjectId: null, orgId: "org-1" },
      } as Parameters<typeof mod.load>[0]);
      await streamedData(result);
    }).toThrow();
  });

  test("sync action queues repo sync through the repository public API", async () => {
    const repoId = "repo-sync";
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
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

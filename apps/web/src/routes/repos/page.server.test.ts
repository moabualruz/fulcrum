import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, mock, test } from "bun:test";

interface RepoListRow {
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
  watcherStatus: string;
  syncLatencyMs: number | null;
  lastSyncError: string | null;
}

const repos: RepoListRow[] = [];
const scopes: Array<{ projectId: string | null }> = [];
const appScope = { em: { kind: "mock-em" }, ctx: { orgId: "org-1", userId: "user-1", projectId: null as string | null } };

function row(overrides: Partial<RepoListRow> = {}): RepoListRow {
  return {
    id: "repo-1",
    slug: "fulcrum",
    path: "/workspace/fulcrum",
    remoteUrl: null,
    branch: "main",
    dirty: false,
    lastSyncAt: "2026-01-04T00:00:00.000Z",
    recentCommit: null,
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

mock.module("$lib/server/application-scope", () => ({
  requestAppScope: async (_locals: unknown, projectId?: string | null) => {
    scopes.push({ projectId: projectId ?? null });
    return { ...appScope, ctx: { ...appScope.ctx, projectId: projectId ?? null } };
  },
}));

mock.module("@integration-hub/interface/repository-pages.ts", () => ({
  listRepositoryPageRows: async () => [...repos],
  listRepositoryDashboard: async () => [],
  loadRepositoryDetail: async () => ({ branches: [], commits: [], files: [], syncLog: [] }),
}));

beforeEach(() => {
  repos.splice(0, repos.length);
  scopes.splice(0, scopes.length);
});

describe("/repos +page.server.ts", () => {
  test("server route uses the repository interface instead of direct application imports", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    expect(source).toContain("@integration-hub/interface/repository-pages");
    expect(source).not.toContain("@integration-hub/application/repos");
  });

  test("load returns repository rows from the service boundary", async () => {
    repos.push(row({ id: "repo-1", slug: "alpha" }), row({ id: "repo-2", slug: "beta" }));
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      locals: { activeProjectId: "project-1", orgId: "org-1" },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ repos: RepoListRow[] }>(result);
    expect(payload.repos.map((candidate) => candidate.slug)).toEqual(["alpha", "beta"]);
    expect(scopes).toEqual([{ projectId: "project-1" }]);
  });

  test("sync action queues through the repository public API", async () => {
    const repoId = "repo-sync";
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const form = new FormData();
    form.set("repo_id", repoId);
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
        return Response.json({ id: repoId }, { status: 202 });
      },
    } as Parameters<typeof mod.actions.sync>[0]);

    expect(result).toEqual({ ok: true, message: "Repo sync queued" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`http://localhost/api/v1/repos/${repoId}/sync?orgId=org-repos`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.credentials).toBe("include");
    expect((calls[0]?.init?.headers as Record<string, string>)?.cookie).toBe("sid=repo-list");
  });

  test("sync action ignores an empty repository id", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const form = new FormData();
    const result = await mod.actions.sync({
      request: {
        headers: new Headers(),
        formData: async () => form,
      },
      locals: { activeProjectId: null, orgId: "org-repos", session: {}, em: null, container: null },
      url: new URL("http://localhost/repos"),
      fetch: async () => {
        throw new Error("sync should not call fetch without repo id");
      },
    } as Parameters<typeof mod.actions.sync>[0]);

    expect(result).toEqual({ ok: true, message: "No repo id" });
  });
});

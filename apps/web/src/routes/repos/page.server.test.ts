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
const repoPagesMock = ((globalThis as typeof globalThis & {
  __repoPagesMock?: Record<string, unknown>;
}).__repoPagesMock ??= {});
repoPagesMock["listRows"] = repos;

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

mock.module("@integration-hub/interface/repository-pages.ts", () => ({
  REPOSITORY_WRITE_ACTIONS_GATE: {
    code: "FEATURE_GATED",
    message: "Write operations disabled. Enable repo-write-ops to create, checkout, or delete branches.",
  },
  listRepositoryPageRows: async () => [...((repoPagesMock["listRows"] as RepoListRow[] | undefined) ?? [])],
  listRepositoryDashboard: async () => [...((repoPagesMock["dashboardRows"] as unknown[] | undefined) ?? [])],
  loadRepositoryDetail: async () => repoPagesMock["dashboardDetail"] ?? { branches: [], commits: [], files: [], syncLog: [] },
  loadRepositoryBranchesPage: async () => repoPagesMock["branchPage"] ?? { repo: null, branches: [], writeOpsEnabled: false },
  createRepositoryBranch: async () => {
    if ((repoPagesMock["branchPage"] as { writeOpsEnabled?: boolean } | undefined)?.writeOpsEnabled === false) {
      const { AppForbiddenError } = await import("@platform-core/domain/errors.ts");
      throw new AppForbiddenError("Write operations disabled.");
    }
    return { ok: true };
  },
  checkoutRepositoryBranch: async (_context: unknown, input: { name: string }) => {
    const branchPage = repoPagesMock["branchPage"] as {
      repo?: { currentBranch?: string | null };
      branches?: Array<{ name: string; isCurrent: boolean }>;
      writeOpsEnabled?: boolean;
    } | undefined;
    if (branchPage?.writeOpsEnabled === false) {
      const { AppForbiddenError } = await import("@platform-core/domain/errors.ts");
      throw new AppForbiddenError("Write operations disabled.");
    }
    if (branchPage?.repo) branchPage.repo.currentBranch = input.name;
    if (branchPage?.branches) {
      branchPage.branches = branchPage.branches.map((branch) => ({ ...branch, isCurrent: branch.name === input.name }));
    }
    return { ok: true };
  },
  deleteRepositoryBranch: async () => ({ ok: true }),
  loadRepositoryCommitsPage: async (_context: unknown, input: { repoId: string; page: number; pageSize: number }) => {
    if (repoPagesMock["knownRepoId"] && input.repoId !== repoPagesMock["knownRepoId"]) {
      const { AppNotFoundError } = await import("@platform-core/domain/errors.ts");
      throw new AppNotFoundError("Repo not found");
    }
    const rows = (repoPagesMock["commitRows"] as unknown[] | undefined) ?? [];
    const start = (input.page - 1) * input.pageSize;
    return { repo: null, commits: rows.slice(start, start + input.pageSize), page: input.page, totalPages: Math.max(1, Math.ceil(rows.length / input.pageSize)), total: rows.length };
  },
  loadRepositoryCommitDetail: async () => repoPagesMock["commitDetail"] ?? { repo: null, commit: null, diff: null },
}));

beforeEach(() => {
  repos.splice(0, repos.length);
});

describe("/repos +page.server.ts", () => {
  test("server route is a pure invocation layer over the NestJS public API", () => {
    const source = readFileSync(join(import.meta.dir, "+page.server.ts"), "utf8");
    // Apps/web must not import TypeORM or platform-core DB runtimes (AGENTS.md).
    expect(source).not.toContain("@integration-hub/application/repos");
    expect(source).not.toContain("@integration-hub/interface/repository-pages");
    expect(source).toMatch(/\/api\/v1\/repos/);
  });

  test("load fetches /api/v1/repos through the page event and maps to page rows", async () => {
    const apiRows = [
      {
        id: "repo-1",
        slug: "alpha",
        name: "alpha",
        kind: "local",
        localPath: "/workspace/alpha",
        remoteUrl: null,
        currentBranch: "main",
        defaultBranch: "main",
        lastSyncAt: "2026-01-04T00:00:00.000Z",
        syncStatus: "idle",
      },
      {
        id: "repo-2",
        slug: "beta",
        name: "beta",
        kind: "remote",
        localPath: null,
        remoteUrl: "https://example.com/beta.git",
        currentBranch: null,
        defaultBranch: "main",
        lastSyncAt: null,
        syncStatus: "idle",
      },
    ];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const calls: string[] = [];
    const result = await mod.load({
      locals: { activeProjectId: "project-1", orgId: "org-1" },
      url: new URL("http://localhost/repos"),
      request: { headers: new Headers({ cookie: "sid=test" }) },
      fetch: async (url: string | URL) => {
        const target = url.toString();
        calls.push(target);
        return Response.json(apiRows, { status: 200 });
      },
    } as unknown as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ repos: RepoListRow[] }>(result);
    expect(payload.repos.map((candidate) => candidate.slug)).toEqual(["alpha", "beta"]);
    expect(calls[0]).toContain("/api/v1/repos?orgId=org-1");
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

import { describe, expect, test } from "bun:test";

import {
  createRepoDashboardService,
  type RepoDashboardRepositories,
} from "../dashboard.ts";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-05-05T12:00:00.000Z");

describe("repo dashboard read model", () => {
  test("list query returns one row per registered repo with required fields", async () => {
    const service = createRepoDashboardService(createRepositories({
      repos: [
        {
          id: "repo-1",
          orgId: ORG_A,
          path: "/workspace/fulcrum",
          remoteUrl: "https://github.com/acme/fulcrum.git",
          branch: "dev/v1.0",
          dirty: true,
          lastSyncAt: new Date("2026-05-05T11:58:00.000Z"),
          syncStatus: "idle",
          lastTouchedAt: new Date("2026-05-05T11:59:00.000Z"),
          watcherStatus: "watching",
        },
      ],
      commits: [
        {
          id: "commit-1",
          orgId: ORG_A,
          repoId: "repo-1",
          sha: "abcdef1234567890",
          message: "feat: dashboard row",
          committedAt: new Date("2026-05-05T11:57:00.000Z"),
        },
      ],
      tasks: [
        { id: "task-1", orgId: ORG_A, repoId: "repo-1", status: "ready" },
      ],
    }), { now: () => NOW });

    const rows = await service.getRepoDashboard(ORG_A);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: "repo-1",
      path: "/workspace/fulcrum",
      remoteUrl: "https://github.com/acme/fulcrum.git",
      branch: "dev/v1.0",
      dirty: true,
      lastSyncAt: "2026-05-05T11:58:00.000Z",
      recentCommit: "abcdef1 feat: dashboard row",
      openTaskCount: 1,
      health: "healthy",
      watcherStatus: "watching",
      syncLatencyMs: 120_000,
      lastSyncError: null,
    });
  });

  test("stale repo returns health=stale when lastSyncAt is older than threshold", async () => {
    const service = createRepoDashboardService(createRepositories({
      repos: [
        {
          id: "repo-stale",
          orgId: ORG_A,
          path: "/workspace/stale",
          branch: "main",
          dirty: false,
          lastSyncAt: new Date("2026-05-05T11:00:00.000Z"),
          syncStatus: "idle",
          watcherStatus: "watching",
        },
      ],
    }), { now: () => NOW, staleAfterMs: 15 * 60 * 1000 });

    const [row] = await service.getRepoDashboard(ORG_A);

    expect(row?.health).toBe("stale");
    expect(row?.syncLatencyMs).toBe(3_600_000);
  });

  test("failed sync returns health=failed and preserves branch and path", async () => {
    const service = createRepoDashboardService(createRepositories({
      repos: [
        {
          id: "repo-failed",
          orgId: ORG_A,
          path: "/workspace/failed",
          branch: "feature/fix",
          dirty: false,
          lastSyncAt: new Date("2026-05-05T11:40:00.000Z"),
          syncStatus: "error",
          watcherStatus: "degraded",
          lastSyncError: "remote rejected fetch",
        },
      ],
    }), { now: () => NOW });

    const [row] = await service.getRepoDashboard(ORG_A);

    expect(row?.health).toBe("failed");
    expect(row?.path).toBe("/workspace/failed");
    expect(row?.branch).toBe("feature/fix");
    expect(row?.lastSyncError).toBe("remote rejected fetch");
  });

  test("openTaskCount from task join is scoped by repo + org_id", async () => {
    const service = createRepoDashboardService(createRepositories({
      repos: [
        {
          id: "repo-1",
          orgId: ORG_A,
          path: "/workspace/one",
          branch: "main",
          dirty: false,
          syncStatus: "idle",
        },
      ],
      tasks: [
        { id: "open-a", orgId: ORG_A, repoId: "repo-1", status: "ready" },
        { id: "closed-a", orgId: ORG_A, repoId: "repo-1", status: "done" },
        { id: "other-org", orgId: ORG_B, repoId: "repo-1", status: "ready" },
        { id: "other-repo", orgId: ORG_A, repoId: "repo-2", status: "ready" },
      ],
    }), { now: () => NOW });

    const [row] = await service.getRepoDashboard(ORG_A);

    expect(row?.openTaskCount).toBe(1);
  });

  test("detail tab selectors return latest 20 branches, commits, files, and sync log entries", async () => {
    const service = createRepoDashboardService(createRepositories({
      repos: [
        {
          id: "repo-detail",
          orgId: ORG_A,
          path: "/workspace/detail",
          branch: "main",
          dirty: false,
          syncStatus: "idle",
        },
      ],
      branches: Array.from({ length: 25 }, (_, index) => ({
        id: `branch-${index}`,
        orgId: ORG_A,
        repoId: "repo-detail",
        name: `branch-${index}`,
        sha: `sha-${index}`,
        updatedAt: new Date(NOW.getTime() - index * 1000),
      })),
      commits: Array.from({ length: 25 }, (_, index) => ({
        id: `commit-${index}`,
        orgId: ORG_A,
        repoId: "repo-detail",
        sha: `commitsha-${index}`,
        message: `commit ${index}`,
        committedAt: new Date(NOW.getTime() - index * 1000),
      })),
      files: Array.from({ length: 25 }, (_, index) => ({
        id: `file-${index}`,
        orgId: ORG_A,
        repoId: "repo-detail",
        path: `src/file-${index}.ts`,
        kind: "file",
        size: index,
        updatedAt: new Date(NOW.getTime() - index * 1000),
      })),
      syncLog: Array.from({ length: 25 }, (_, index) => ({
        id: `log-${index}`,
        orgId: ORG_A,
        repoId: "repo-detail",
        status: index === 0 ? "failed" : "succeeded",
        message: `sync ${index}`,
        createdAt: new Date(NOW.getTime() - index * 1000),
      })),
    }), { now: () => NOW });

    const detail = await service.getRepoDetail(ORG_A, "repo-detail");

    expect(detail.branches).toHaveLength(20);
    expect(detail.commits).toHaveLength(20);
    expect(detail.files).toHaveLength(20);
    expect(detail.syncLog).toHaveLength(20);
    expect(detail.branches.map((branch) => branch.name).slice(0, 3)).toEqual(["branch-0", "branch-1", "branch-2"]);
    expect(detail.commits.map((commit) => commit.sha).slice(0, 3)).toEqual(["commitsha-0", "commitsha-1", "commitsha-2"]);
    expect(detail.files.map((file) => file.path).slice(0, 3)).toEqual(["src/file-0.ts", "src/file-1.ts", "src/file-2.ts"]);
    expect(detail.syncLog.map((entry) => entry.id).slice(0, 3)).toEqual(["log-0", "log-1", "log-2"]);
  });
});

function createRepositories(input: Partial<MockData> = {}): RepoDashboardRepositories {
  const data: MockData = {
    repos: input.repos ?? [],
    branches: input.branches ?? [],
    commits: input.commits ?? [],
    files: input.files ?? [],
    tasks: input.tasks ?? [],
    syncLog: input.syncLog ?? [],
  };

  return {
    repos: {
      async listDashboard(orgId) {
        return data.repos.filter((repo) => repo.orgId === orgId);
      },
      async getDashboardRepo(orgId, repoId) {
        return data.repos.find((repo) => repo.orgId === orgId && repo.id === repoId) ?? null;
      },
    },
    branches: {
      async listLatest(orgId, repoId, limit) {
        return data.branches
          .filter((branch) => branch.orgId === orgId && branch.repoId === repoId)
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
          .slice(0, limit);
      },
    },
    commits: {
      async latestByRepo(orgId, repoIds) {
        return new Map(repoIds.map((repoId) => [
          repoId,
          data.commits
            .filter((commit) => commit.orgId === orgId && commit.repoId === repoId)
            .sort((left, right) => right.committedAt.getTime() - left.committedAt.getTime())[0] ?? null,
        ]));
      },
      async listLatest(orgId, repoId, limit) {
        return data.commits
          .filter((commit) => commit.orgId === orgId && commit.repoId === repoId)
          .sort((left, right) => right.committedAt.getTime() - left.committedAt.getTime())
          .slice(0, limit);
      },
    },
    files: {
      async listLatest(orgId, repoId, limit) {
        return data.files
          .filter((file) => file.orgId === orgId && file.repoId === repoId)
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
          .slice(0, limit);
      },
    },
    tasks: {
      async countOpenByRepo(orgId, repoIds) {
        return new Map(repoIds.map((repoId) => [
          repoId,
          data.tasks.filter((task) => task.orgId === orgId && task.repoId === repoId && task.status !== "done").length,
        ]));
      },
    },
    syncLog: {
      async listLatest(orgId, repoId, limit) {
        return data.syncLog
          .filter((entry) => entry.orgId === orgId && entry.repoId === repoId)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, limit);
      },
    },
  };
}

interface MockData {
  repos: Awaited<ReturnType<RepoDashboardRepositories["repos"]["listDashboard"]>>;
  branches: Awaited<ReturnType<RepoDashboardRepositories["branches"]["listLatest"]>>;
  commits: Array<NonNullable<Awaited<ReturnType<RepoDashboardRepositories["commits"]["listLatest"]>>[number]>>;
  files: Awaited<ReturnType<RepoDashboardRepositories["files"]["listLatest"]>>;
  tasks: Array<{ id: string; orgId: string; repoId: string; status: string | null }>;
  syncLog: Awaited<ReturnType<RepoDashboardRepositories["syncLog"]["listLatest"]>>;
}

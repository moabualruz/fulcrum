import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";

import {
  createRepoSyncLocalTask,
  enqueueRepoSyncLocal,
  type RepoSyncLocalRepositories,
} from "../../src/repos/workers/sync-local.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const REPO_ID = "11111111-1111-1111-1111-111111111111";

function createRepos(options: {
  repo?: Partial<RepoSyncLocalRepositories["repoRepo"] extends { findLocalById(id: string): Promise<infer R> } ? NonNullable<R> : never>;
  failAt?: "status" | "branches" | "commits" | "files";
} = {}) {
  const calls: string[] = [];
  const repo = {
    id: REPO_ID,
    orgId: ORG_ID,
    projectId: "project-1",
    kind: "local" as const,
    localPath: "/tmp/repo",
    syncStatus: "idle",
    ...options.repo,
  };
  const statusUpdates: RepoSyncLocalRepositories["repoRepo"] extends {
    updateSyncState(input: infer I): Promise<unknown>;
  } ? I[] : never[] = [];
  const branches: Array<{ name: string; sha: string; isDefault: boolean; isCurrent: boolean }> = [];
  const commits: Array<{ sha: string; message: string; author: string; committedAt: Date }> = [];
  const files: Array<{ path: string; kind: "file" | "dir"; size: number }> = [];
  const searchDocuments: Array<{ path: string; kind: "file" | "dir"; size: number }> = [];
  const events: Array<Record<string, unknown>> = [];

  const repositories: RepoSyncLocalRepositories = {
    repoRepo: {
      async findLocalById(id) {
        calls.push("repo");
        expect(id).toBe(REPO_ID);
        return repo;
      },
      async updateSyncState(input) {
        calls.push(`repo:${input.syncStatus}`);
        statusUpdates.push(input);
      },
    },
    branches: {
      async upsertBulk(input) {
        calls.push("branches");
        branches.push(...input.branches);
      },
    },
    commits: {
      async upsertBulk(input) {
        calls.push("commits");
        commits.push(...input.commits);
      },
    },
    files: {
      async upsertBulk(input) {
        calls.push("files");
        files.push(...input.files);
      },
    },
    searchDocuments: {
      async upsertRepoFiles(input) {
        calls.push("search");
        searchDocuments.push(...input.files);
      },
    },
    events: {
      async insert(input) {
        calls.push(`event:${input.verb}`);
        events.push(input);
      },
    },
    git: {
      async getStatus(localPath) {
        calls.push("git:status");
        expect(localPath).toBe(repo.localPath ?? "");
        if (options.failAt === "status") throw new Error("status failed");
        return { branch: "main", dirty: false, ahead: 0, behind: 0, staged: [], unstaged: [] };
      },
      async listBranches() {
        calls.push("git:branches");
        if (options.failAt === "branches") throw new Error("branches failed");
        return [
          { name: "main", headSha: "a".repeat(40), isDefault: true, isCurrent: true },
          { name: "feature", headSha: "b".repeat(40), isDefault: false, isCurrent: false },
        ];
      },
      async getCommitLog(_localPath, logOptions) {
        calls.push("git:commits");
        expect(logOptions).toEqual({ maxCount: 200, offset: 0 });
        if (options.failAt === "commits") throw new Error("commits failed");
        return [
          {
            sha: "a".repeat(40),
            authorName: "Ada",
            authorEmail: "ada@example.com",
            committedAt: new Date("2026-05-01T00:00:00.000Z"),
            subject: "first",
            body: "",
            parents: [],
          },
        ];
      },
      async getFileTree() {
        calls.push("git:files");
        if (options.failAt === "files") throw new Error("files failed");
        return [
          { path: "README.md", kind: "file", sizeBytes: 12 },
          { path: "src", kind: "dir", sizeBytes: 0 },
        ];
      },
    },
  };

  return { repositories, calls, statusUpdates, branches, commits, files, searchDocuments, events };
}

describe("repo.sync.local worker", () => {
  test("runs full local sync pipeline and marks repo idle", async () => {
    const state = createRepos();

    await createRepoSyncLocalTask(state.repositories)({ repoId: REPO_ID });

    expect(state.calls).toEqual([
      "repo",
      "repo:syncing",
      "git:status",
      "repo:syncing",
      "git:branches",
      "branches",
      "git:commits",
      "commits",
      "git:files",
      "files",
      "search",
      "repo:idle",
      "event:repo.sync.completed",
    ]);
    expect(state.statusUpdates[0]).toMatchObject({ repoId: REPO_ID, orgId: ORG_ID, syncStatus: "syncing" });
    expect(state.statusUpdates[1]).toMatchObject({ currentBranch: "main" });
    expect(state.statusUpdates.at(-1)).toMatchObject({
      syncStatus: "idle",
      lastSyncAt: expect.any(Date),
      lastTouchedAt: expect.any(Date),
    });
    expect(state.branches).toEqual([
      { name: "main", sha: "a".repeat(40), isDefault: true, isCurrent: true },
      { name: "feature", sha: "b".repeat(40), isDefault: false, isCurrent: false },
    ]);
    expect(state.commits[0]).toMatchObject({
      sha: "a".repeat(40),
      author: "Ada <ada@example.com>",
      message: "first",
    });
    expect(state.files).toEqual([
      { path: "README.md", kind: "file", size: 12 },
      { path: "src", kind: "dir", size: 0 },
    ]);
    expect(state.searchDocuments).toEqual([
      { path: "README.md", kind: "file", size: 12 },
      { path: "src", kind: "dir", size: 0 },
    ]);
    expect(state.events).toEqual([expect.objectContaining({
      orgId: ORG_ID,
      projectId: "project-1",
      verb: "repo.sync.completed",
      subjectKind: "repo",
      subjectId: REPO_ID,
      payload: expect.objectContaining({
        branch: "main",
        commitCount: 1,
        dirty: false,
      }),
    })]);
  });

  test("marks repo error and emits repo.sync.failed event on exception", async () => {
    const state = createRepos({ failAt: "commits" });

    await expect(createRepoSyncLocalTask(state.repositories)({ repoId: REPO_ID })).rejects.toThrow("commits failed");

    expect(state.statusUpdates.at(-1)).toMatchObject({ repoId: REPO_ID, orgId: ORG_ID, syncStatus: "error" });
    expect(state.events).toEqual([expect.objectContaining({
      orgId: ORG_ID,
      verb: "repo.sync.failed",
      subjectKind: "repo",
      subjectId: REPO_ID,
      payload: expect.objectContaining({ message: "commits failed" }),
    })]);
  });

  test("enqueue helper uses repoId as graphile job key", async () => {
    const jobs: Array<Record<string, unknown>> = [];
    await enqueueRepoSyncLocal({
      async addJob(name, payload, options) {
        jobs.push({ name, payload, options });
      },
    }, REPO_ID);

    expect(jobs).toEqual([{
      name: "repo.sync.local",
      payload: { repoId: REPO_ID },
      options: { jobKey: `repo.sync.local:${REPO_ID}` },
    }]);
  });

  test("integration: fixture git repo syncs commits, branches, files, and search documents", async () => {
    const root = await mkdtemp(join(tmpdir(), "fulcrum-sync-local-"));
    const repoPath = join(root, "repo");
    try {
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit({ baseDir: repoPath });
      await git.init();
      await git.addConfig("user.name", "Fixture Author");
      await git.addConfig("user.email", "fixture@example.com");
      await git.branch(["-M", "main"]);

      for (let index = 1; index <= 5; index += 1) {
        await writeFile(join(repoPath, `file-${index}.txt`), `content ${index}\n`);
        await git.add(".");
        await git.commit(`test(repos): fixture commit ${index}`);
      }

      const state = createRepos({ repo: { localPath: repoPath } });
      state.repositories.git = undefined;

      await createRepoSyncLocalTask(state.repositories)({ repoId: REPO_ID });

      expect(state.commits).toHaveLength(5);
      expect(state.branches).toContainEqual(expect.objectContaining({ name: "main", isCurrent: true }));
      expect(state.files).toEqual(expect.arrayContaining([
        { path: "file-1.txt", kind: "file", size: 10 },
        { path: "file-5.txt", kind: "file", size: 10 },
      ]));
      expect(state.searchDocuments).toEqual(state.files);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("unit benchmark: 10k-file repo pipeline completes under 5 seconds", async () => {
    const state = createRepos();
    state.repositories.git = {
      ...state.repositories.git!,
      async getFileTree() {
        return Array.from({ length: 10_000 }, (_, index) => ({
          path: `src/file-${index}.ts`,
          kind: "file" as const,
          sizeBytes: index,
        }));
      },
    };

    const startedAt = performance.now();
    await createRepoSyncLocalTask(state.repositories)({ repoId: REPO_ID });
    const elapsedMs = performance.now() - startedAt;

    expect(state.files).toHaveLength(10_000);
    expect(elapsedMs).toBeLessThan(5_000);
  });
});

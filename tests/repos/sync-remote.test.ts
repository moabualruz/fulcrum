import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";

import {
  createRepoLruWarmupTask,
  createRepoSyncRemoteTask,
  enqueueRepoSyncRemote,
  resolveRemoteMirrorPath,
  type RepoSyncRemoteRepo,
  type RepoSyncRemoteRepositories,
} from "../../src/repos/workers/sync-remote.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const REPO_ID = "11111111-1111-1111-1111-111111111111";

function createRepos(options: {
  repo?: Partial<RepoSyncRemoteRepo>;
  failAt?: "mirror" | "branches" | "commits" | "files";
} = {}) {
  const calls: string[] = [];
  const repo = {
    id: REPO_ID,
    orgId: ORG_ID,
    projectId: "project-1",
    kind: "remote" as const,
    remoteUrl: "https://github.com/moabualruz/fulcrum.git",
    slug: "fulcrum",
    syncStatus: "idle",
    ...options.repo,
  };
  const statusUpdates: RepoSyncRemoteRepositories["repoRepo"] extends {
    updateSyncState(input: infer I): Promise<unknown>;
  } ? I[] : never[] = [];
  const branches: Array<{ name: string; sha: string; isDefault: boolean; isCurrent: boolean }> = [];
  const commits: Array<{ sha: string; message: string; author: string; committedAt: Date }> = [];
  const files: Array<{ path: string; kind: "file" | "dir"; size: number }> = [];
  const searchDocuments: Array<{ path: string; kind: "file" | "dir"; size: number }> = [];
  const events: Array<Record<string, unknown>> = [];

  const repositories: RepoSyncRemoteRepositories = {
    repoRepo: {
      async findRemoteById(id) {
        calls.push("repo");
        expect(id).toBe(REPO_ID);
        return repo;
      },
      async updateSyncState(input) {
        calls.push(`repo:${input.syncStatus}`);
        statusUpdates.push(input);
      },
      async listRecentlyTouchedRemote(limit) {
        calls.push(`repo:lru:${limit}`);
        return [{ id: "repo-a" }, { id: "repo-b" }];
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
      async upsertBulk(input: { files: unknown[] }) {
        calls.push("files");
        files.push(...input.files as typeof files);
      },
    },
    searchDocuments: {
      async upsertRepoFiles(input: { files: unknown[] }) {
        calls.push("search");
        searchDocuments.push(...input.files as typeof searchDocuments);
      },
    },
    events: {
      async insert(input: { verb: string }) {
        calls.push(`event:${input.verb}`);
        events.push(input);
      },
    },
    git: {
      async ensureMirror(remoteUrl: string, mirrorPath: string) {
        calls.push("git:mirror");
        if (!repo.remoteUrl) throw new Error("missing remote url");
        expect(remoteUrl).toBe(repo.remoteUrl);
        expect(mirrorPath).toContain(join(ORG_ID, "fulcrum"));
        if (options.failAt === "mirror") throw new Error("mirror failed");
      },
      async listBranches() {
        calls.push("git:branches");
        if (options.failAt === "branches") throw new Error("branches failed");
        return [
          { name: "main", headSha: "a".repeat(40), isDefault: true, isCurrent: false },
          { name: "feature", headSha: "b".repeat(40), isDefault: false, isCurrent: false },
        ];
      },
      async getCommitLog(_mirrorPath: string, logOptions: { maxCount: number; offset: number }) {
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
            body: "body",
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

describe("repo.sync.remote worker", () => {
  test("resolves stable mirror paths under org and slug", () => {
    expect(resolveRemoteMirrorPath("/tmp/fulcrum-repos", ORG_ID, "Fulcrum Repo")).toBe(
      join("/tmp/fulcrum-repos", ORG_ID, "fulcrum-repo"),
    );
  });

  test("ensures mirror, runs repo index pipeline, and marks repo idle", async () => {
    const state = createRepos();

    await createRepoSyncRemoteTask(state.repositories, { mirrorRoot: "/tmp/fulcrum-repos" })({ repoId: REPO_ID });

    expect(state.calls).toEqual([
      "repo",
      "repo:syncing",
      "git:mirror",
      "git:branches",
      "branches",
      "git:commits",
      "commits",
      "git:files",
      "files",
      "search",
      "repo:idle",
    ]);
    expect(state.statusUpdates.at(-1)).toMatchObject({
      syncStatus: "idle",
      lastSyncAt: expect.any(Date),
      lastTouchedAt: expect.any(Date),
    });
    expect(state.branches).toContainEqual({ name: "main", sha: "a".repeat(40), isDefault: true, isCurrent: false });
    expect(state.commits[0]).toMatchObject({
      sha: "a".repeat(40),
      message: "first\n\nbody",
      author: "Ada <ada@example.com>",
    });
    expect(state.files).toEqual([
      { path: "README.md", kind: "file", size: 12 },
      { path: "src", kind: "dir", size: 0 },
    ]);
    expect(state.searchDocuments).toEqual(state.files);
  });

  test("marks repo error and emits repo.sync.failed event on exception", async () => {
    const state = createRepos({ failAt: "mirror" });

    await expect(createRepoSyncRemoteTask(state.repositories, { mirrorRoot: "/tmp/fulcrum-repos" })({ repoId: REPO_ID }))
      .rejects.toThrow("mirror failed");

    expect(state.statusUpdates.at(-1)).toMatchObject({ repoId: REPO_ID, orgId: ORG_ID, syncStatus: "error" });
    expect(state.events).toEqual([expect.objectContaining({
      orgId: ORG_ID,
      verb: "repo.sync.failed",
      subjectKind: "repo",
      subjectId: REPO_ID,
      payload: expect.objectContaining({ message: "mirror failed" }),
    })]);
  });

  test("enqueue helper uses repoId as graphile job key", async () => {
    const jobs: Array<Record<string, unknown>> = [];
    await enqueueRepoSyncRemote({
      async addJob(name: string, payload: unknown, options?: unknown) {
        jobs.push({ name, payload, options });
      },
    }, REPO_ID);

    expect(jobs).toEqual([{
      name: "repo.sync.remote",
      payload: { repoId: REPO_ID },
      options: { jobKey: `repo.sync.remote:${REPO_ID}` },
    }]);
  });

  test("lru warmup enqueues top five remote repos", async () => {
    const jobs: Array<Record<string, unknown>> = [];
    const state = createRepos();

    await createRepoLruWarmupTask(state.repositories, {
      async addJob(name: string, payload: unknown, options?: unknown) {
        jobs.push({ name, payload, options });
      },
    })();

    expect(state.calls).toContain("repo:lru:5");
    expect(jobs).toEqual([
      { name: "repo.sync.remote", payload: { repoId: "repo-a" }, options: { jobKey: "repo.sync.remote:repo-a" } },
      { name: "repo.sync.remote", payload: { repoId: "repo-b" }, options: { jobKey: "repo.sync.remote:repo-b" } },
    ]);
  });

  test("integration: local bare remote syncs commits, branches, files, and search documents", async () => {
    const root = await mkdtemp(join(tmpdir(), "fulcrum-sync-remote-"));
    const workPath = join(root, "work");
    const barePath = join(root, "origin.git");
    const mirrorRoot = join(root, "mirrors");
    try {
      await mkdir(workPath, { recursive: true });
      const git = simpleGit({ baseDir: workPath });
      await git.init();
      await git.addConfig("user.name", "Fixture Author");
      await git.addConfig("user.email", "fixture@example.com");
      await git.branch(["-M", "main"]);

      await writeFile(join(workPath, "README.md"), "readme\n");
      await git.add(".");
      await git.commit("test(repos): initial remote commit");
      await git.checkoutLocalBranch("feature/fixture");
      await writeFile(join(workPath, "feature.txt"), "feature\n");
      await git.add(".");
      await git.commit("test(repos): feature remote commit");
      await git.checkout("main");

      await simpleGit().raw(["init", "--bare", barePath]);
      await git.addRemote("origin", barePath);
      await git.push(["-u", "origin", "main"]);
      await git.push("origin", "feature/fixture");

      const state = createRepos({ repo: { remoteUrl: barePath, slug: "origin" } });
      state.repositories.git = undefined;

      await createRepoSyncRemoteTask(state.repositories, { mirrorRoot })({ repoId: REPO_ID });

      expect(state.commits).toHaveLength(2);
      expect(state.branches).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "main" }),
        expect.objectContaining({ name: "feature/fixture" }),
      ]));
      expect(state.files).toEqual(expect.arrayContaining([
        { path: "README.md", kind: "file", size: 7 },
      ]));
      expect(state.searchDocuments).toEqual(state.files);

      await writeFile(join(workPath, "second.txt"), "second\n");
      await git.add(".");
      await git.commit("test(repos): second remote commit");
      await git.push("origin", "main");

      await createRepoSyncRemoteTask(state.repositories, { mirrorRoot })({ repoId: REPO_ID });

      expect(state.commits.length).toBeGreaterThanOrEqual(5);
      expect(state.files).toContainEqual({ path: "second.txt", kind: "file", size: 7 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

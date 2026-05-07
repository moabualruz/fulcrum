import { describe, expect, test } from "bun:test";

import {
  createRepoLruWarmupTask,
  selectTopRemoteReposForWarmup,
} from "../workers/sync-remote.ts";
import {
  RepoWatcher,
  type JobQueue,
  type RepoWatchEvent,
  type WatchBackend,
  type WatchHandle,
  type WatchableRepo,
} from "../watcher.ts";

class FakeWatchBackend implements WatchBackend {
  readonly kind = "chokidar";
  private onEvent: ((event: RepoWatchEvent, path: string) => void) | null = null;

  watch(_path: string, onEvent: (event: RepoWatchEvent, path: string) => void): WatchHandle {
    this.onEvent = onEvent;
    return { stop() {} };
  }

  emit(event: RepoWatchEvent, path: string): void {
    this.onEvent?.(event, path);
  }
}

function localRepo(overrides: Partial<WatchableRepo> = {}): WatchableRepo {
  return {
    id: "repo-1",
    kind: "local",
    localPath: "/workspace/project",
    syncStatus: "idle",
    archived: false,
    ...overrides,
  };
}

function createQueue(fail = false): JobQueue & { jobs: Array<{ name: string; payload: Record<string, unknown> }> } {
  const jobs: Array<{ name: string; payload: Record<string, unknown> }> = [];
  let failed = false;
  return {
    jobs,
    async enqueue(name, payload) {
      if (fail && !failed) {
        failed = true;
        throw new Error("queue unavailable");
      }
      jobs.push({ name, payload });
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RepoWatcher SLA", () => {
  test("emits add/change/unlink repo-change jobs inside 2s", async () => {
    const backend = new FakeWatchBackend();
    const queue = createQueue();
    const watcher = new RepoWatcher(localRepo(), queue, { backend, debounceMs: 10 });
    await watcher.start();

    for (const eventType of ["add", "change", "unlink"] as const) {
      const start = performance.now();
      backend.emit(eventType, `src/${eventType}.ts`);

      while (queue.jobs.length === 0 && performance.now() - start < 2_000) {
        await sleep(5);
      }

      expect(performance.now() - start).toBeLessThan(2_000);
      expect(queue.jobs.shift()).toEqual({
        name: "repo.sync.local",
        payload: {
          repoId: "repo-1",
          filename: `src/${eventType}.ts`,
          eventType,
        },
      });
    }

    await watcher.stop();
  });

  test("coalesces repeated bursts to one enqueue per repo path per debounce window", async () => {
    const backend = new FakeWatchBackend();
    const queue = createQueue();
    const watcher = new RepoWatcher(localRepo(), queue, { backend, debounceMs: 25 });
    await watcher.start();

    backend.emit("change", "README.md");
    backend.emit("change", "README.md");
    backend.emit("change", "README.md");
    await sleep(60);

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]?.payload).toEqual({
      repoId: "repo-1",
      filename: "README.md",
      eventType: "change",
    });

    await watcher.stop();
  });

  test("LRU warmup selects exactly top 5 remote repos by weighted recency score", async () => {
    const selected = selectTopRemoteReposForWarmup(
      [
        { id: "old-failing", lastAccessedAt: new Date("2026-05-05T09:00:00Z"), failureCount: 2 },
        { id: "recent-1", lastAccessedAt: new Date("2026-05-05T10:00:00Z"), failureCount: 0 },
        { id: "recent-2", lastAccessedAt: new Date("2026-05-05T10:05:00Z"), failureCount: 0 },
        { id: "flaky-recent", lastAccessedAt: new Date("2026-05-05T10:04:00Z"), failureCount: 3 },
        { id: "recent-3", lastAccessedAt: new Date("2026-05-05T10:03:00Z"), failureCount: 0 },
        { id: "recent-4", lastAccessedAt: new Date("2026-05-05T10:02:00Z"), failureCount: 0 },
        { id: "recent-5", lastAccessedAt: new Date("2026-05-05T10:01:00Z"), failureCount: 0 },
      ],
      5,
    );

    expect(selected.map((repo) => repo.id)).toEqual([
      "recent-2",
      "recent-3",
      "recent-4",
      "recent-5",
      "recent-1",
    ]);
    expect(selected).toHaveLength(5);
  });

  test("LRU task asks repository selector for top 5 and enqueues no more than 5 remotes", async () => {
    const queue = {
      jobs: [] as Array<{ name: string; payload: Record<string, unknown> }>,
      async addJob(name: "repo.sync.remote", payload: { repoId: string }) {
        this.jobs.push({ name, payload });
      },
    };
    const calls: number[] = [];
    const task = createRepoLruWarmupTask(
      {
        repoRepo: {
          async findRemoteById() {
            return null;
          },
          async updateSyncState() {},
          async listRecentlyTouchedRemote(limit: number) {
            calls.push(limit);
            return ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }));
          },
        },
        branches: { async upsertBulk() {} },
        commits: { async upsertBulk() {} },
        files: { async upsertBulk() {} },
        searchDocuments: { async upsertRepoFiles() {} },
        events: { async insert() {} },
      },
      queue,
    );

    await task();

    expect(calls).toEqual([5]);
    expect(queue.jobs.map((job) => job.payload.repoId)).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("invalid watcher event path is logged and ignored", async () => {
    const backend = new FakeWatchBackend();
    const queue = createQueue();
    const warnings: string[] = [];
    const watcher = new RepoWatcher(localRepo(), queue, {
      backend,
      debounceMs: 10,
      logger: { warn: (message) => warnings.push(message) },
    });
    await watcher.start();

    backend.emit("change", "../outside.ts");
    await sleep(40);

    expect(queue.jobs).toHaveLength(0);
    expect(warnings[0]).toContain("ignored repo watcher event outside registered root");
    await watcher.stop();
  });

  test("sync enqueue failures use retryable enqueue path", async () => {
    const backend = new FakeWatchBackend();
    const queue = createQueue(true);
    const watcher = new RepoWatcher(localRepo(), queue, { backend, debounceMs: 10 });
    await watcher.start();

    backend.emit("change", "apps/cli/src/main.ts");
    await sleep(40);

    expect(queue.jobs).toEqual([
      {
        name: "repo.sync.local",
        payload: {
          repoId: "repo-1",
          filename: "apps/cli/src/main.ts",
          eventType: "change",
          retryable: true,
        },
      },
    ]);
    await watcher.stop();
  });
});

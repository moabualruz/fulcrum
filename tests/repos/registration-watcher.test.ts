import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { simpleGit } from "simple-git";

import {
  RepoRegistrationService,
  type RegisteredRepo,
  type RepoStore,
} from "../../src/repos/register.ts";
import {
  RepoWatcher,
  WatcherRegistry,
  type JobQueue,
  type WatchBackend,
  type WatchHandle,
} from "../../src/repos/watcher.ts";

class MemoryRepoStore implements RepoStore {
  readonly rows = new Map<string, RegisteredRepo>();
  readonly createdInputs: Array<Record<string, unknown>> = [];

  async createLocal(input: {
    localPath: string;
    projectId?: string | null;
    name?: string;
    slug?: string;
  }): Promise<RegisteredRepo> {
    this.createdInputs.push({ ...input });
    const id = `repo-${this.rows.size + 1}`;
    const row: RegisteredRepo = {
      id,
      name: basename(input.localPath),
      slug: basename(input.localPath),
      kind: "local",
      localPath: input.localPath,
      projectId: input.projectId ?? null,
      syncStatus: "idle",
      archived: false,
    };
    this.rows.set(id, row);
    return row;
  }

  async createRemote(input: {
    remoteUrl: string;
    projectId?: string | null;
    name?: string;
    slug?: string;
  }): Promise<RegisteredRepo> {
    this.createdInputs.push({ ...input });
    const id = `repo-${this.rows.size + 1}`;
    const row: RegisteredRepo = {
      id,
      name: input.name,
      slug: input.slug,
      kind: "remote",
      remoteUrl: input.remoteUrl,
      projectId: input.projectId ?? null,
      syncStatus: "idle",
      archived: false,
    };
    this.rows.set(id, row);
    return row;
  }

  async listActiveLocal(): Promise<RegisteredRepo[]> {
    return [...this.rows.values()].filter((row) => row.kind === "local" && !row.archived);
  }

  async archive(id: string): Promise<RegisteredRepo | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    row.archived = true;
    return row;
  }
}

class MemoryQueue implements JobQueue {
  readonly jobs: Array<{ name: string; payload: Record<string, unknown> }> = [];

  async enqueue(name: string, payload: Record<string, unknown>): Promise<void> {
    this.jobs.push({ name, payload });
  }
}

class ManualHandle implements WatchHandle {
  closed = false;

  async close(): Promise<void> {
    this.closed = true;
  }
}

class ManualBackend implements WatchBackend {
  readonly kind: "chokidar" | "parcel";
  readonly handles: ManualHandle[] = [];
  private callbacks: Array<(event: "add" | "change" | "unlink", path: string) => void> = [];

  constructor(kind: "chokidar" | "parcel" = "chokidar") {
    this.kind = kind;
  }

  async watch(
    _path: string,
    onEvent: (event: "add" | "change" | "unlink", path: string) => void,
  ): Promise<WatchHandle> {
    this.callbacks.push(onEvent);
    const handle = new ManualHandle();
    this.handles.push(handle);
    return handle;
  }

  emit(event: "add" | "change" | "unlink" = "change", path = "README.md") {
    for (const callback of this.callbacks) callback(event, path);
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for predicate");
    await Bun.sleep(10);
  }
}

describe("local repo registration and watcher", () => {
  const tmpRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpRoots.map((root) => rm(root, { recursive: true, force: true })));
  });

  async function tempRepo(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "fulcrum-repo-watch-"));
    tmpRoots.push(root);
    await mkdir(join(root, "repo"), { recursive: true });
    const repoPath = join(root, "repo");
    await simpleGit({ baseDir: repoPath }).init();
    return repoPath;
  }

  test("registers local repos idle and starts one watcher", async () => {
    const store = new MemoryRepoStore();
    const queue = new MemoryQueue();
    const backend = new ManualBackend();
    const registry = new WatcherRegistry(store, queue, { backend });
    const service = new RepoRegistrationService(store, registry);
    const repoPath = await tempRepo();

    const row = await service.add({ path: repoPath });

    expect(row).toMatchObject({
      kind: "local",
      localPath: repoPath,
      syncStatus: "idle",
      archived: false,
    });
    expect(registry.count).toBe(1);
  });

  test("registers project-scoped local repos", async () => {
    const store = new MemoryRepoStore();
    const registry = new WatcherRegistry(store, new MemoryQueue(), { backend: new ManualBackend() });
    const service = new RepoRegistrationService(store, registry);

    await service.add({ path: await tempRepo(), projectId: "00000000-0000-0000-0000-000000000123" });

    expect(store.createdInputs[0]).toMatchObject({
      projectId: "00000000-0000-0000-0000-000000000123",
    });
  });

  test("registers remote repos idle without starting a watcher", async () => {
    const store = new MemoryRepoStore();
    const queue = new MemoryQueue();
    const backend = new ManualBackend();
    const registry = new WatcherRegistry(store, queue, { backend });
    const service = new RepoRegistrationService(store, registry);

    const row = await service.addRemote({
      url: "https://github.com/moabualruz/fulcrum.git",
      name: "Fulcrum Mirror",
      projectId: "project-remote",
    });

    expect(row).toMatchObject({
      kind: "remote",
      remoteUrl: "https://github.com/moabualruz/fulcrum.git",
      name: "Fulcrum Mirror",
      slug: "fulcrum",
      projectId: "project-remote",
      syncStatus: "idle",
      archived: false,
    });
    expect(registry.count).toBe(0);
    expect(store.createdInputs[0]).toMatchObject({
      remoteUrl: "https://github.com/moabualruz/fulcrum.git",
      name: "Fulcrum Mirror",
      slug: "fulcrum",
      projectId: "project-remote",
    });
  });

  test("startAll starts watchers for every active local repo", async () => {
    const store = new MemoryRepoStore();
    const backend = new ManualBackend();
    const registry = new WatcherRegistry(store, new MemoryQueue(), { backend });

    await store.createLocal({ localPath: await tempRepo() });
    await store.createLocal({ localPath: await tempRepo() });
    await registry.startAll();

    expect(registry.count).toBe(2);
    expect(backend.handles).toHaveLength(2);
  });

  test("debounces filesystem events and enqueues repo.sync.local with latest event metadata", async () => {
    const queue = new MemoryQueue();
    const backend = new ManualBackend();
    const watcher = new RepoWatcher(
      { id: "repo-1", kind: "local", localPath: await tempRepo(), syncStatus: "idle", archived: false },
      queue,
      { backend, debounceMs: 30 },
    );

    await watcher.start();
    backend.emit("change");
    backend.emit("add");
    backend.emit("unlink");

    await waitFor(() => queue.jobs.length === 1);
    expect(queue.jobs).toEqual([{
      name: "repo.sync.local",
      payload: { repoId: "repo-1", eventType: "unlink", filename: "README.md" },
    }]);
  });

  test("remove stops the watcher and archives the repo", async () => {
    const store = new MemoryRepoStore();
    const backend = new ManualBackend();
    const registry = new WatcherRegistry(store, new MemoryQueue(), { backend });
    const service = new RepoRegistrationService(store, registry);
    const row = await service.add({ path: await tempRepo() });

    const archived = await service.remove(row.id);

    expect(archived?.archived).toBe(true);
    expect(registry.count).toBe(0);
    expect(backend.handles[0]?.closed).toBe(true);
  });

  test("stop closes the active watcher handle", async () => {
    const store = new MemoryRepoStore();
    const backend = new ManualBackend();
    const registry = new WatcherRegistry(store, new MemoryQueue(), { backend });
    const row = await store.createLocal({ localPath: await tempRepo() });

    await registry.start(row.id);
    await registry.stop(row.id);

    expect(backend.handles[0]?.closed).toBe(true);
  });

  test("integration: tmp git repo change enqueues within one second", async () => {
    const store = new MemoryRepoStore();
    const queue = new MemoryQueue();
    const registry = new WatcherRegistry(store, queue, { debounceMs: 30 });
    const service = new RepoRegistrationService(store, registry);
    const repoPath = await tempRepo();
    const row = await service.add({ path: repoPath });

    await writeFile(join(repoPath, "watched.txt"), "changed\n");

    await waitFor(() => queue.jobs.some((job) => job.payload.repoId === row.id), 1000);
    await registry.stopAll();
  });

  test("parcel fallback uses same watcher interface", async () => {
    const queue = new MemoryQueue();
    const backend = new ManualBackend("parcel");
    const watcher = new RepoWatcher(
      { id: "repo-parcel", kind: "local", localPath: await tempRepo(), syncStatus: "idle", archived: false },
      queue,
      { backend, debounceMs: 30 },
    );

    await watcher.start();
    backend.emit("change");

    await waitFor(() => queue.jobs.length === 1);
    expect(backend.kind).toBe("parcel");
    expect(queue.jobs[0]).toEqual({
      name: "repo.sync.local",
      payload: { repoId: "repo-parcel", eventType: "change", filename: "README.md" },
    });
  });

  test("watcher count stays bounded across add/remove cycles", async () => {
    const store = new MemoryRepoStore();
    const registry = new WatcherRegistry(store, new MemoryQueue(), { backend: new ManualBackend() });
    const service = new RepoRegistrationService(store, registry);

    for (let i = 0; i < 5; i += 1) {
      const row = await service.add({ path: await tempRepo() });
      expect(registry.count).toBeLessThanOrEqual(i + 1);
      await service.remove(row.id);
      expect(registry.count).toBe(0);
    }
  });
});

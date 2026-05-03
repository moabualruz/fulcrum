import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export type RepoWatchEvent = "add" | "change" | "unlink";

export interface WatchHandle {
  close(): Promise<void> | void;
}

export interface WatchBackend {
  readonly kind: "chokidar" | "parcel";
  watch(
    path: string,
    onEvent: (event: RepoWatchEvent, path: string) => void,
  ): Promise<WatchHandle> | WatchHandle;
}

export interface JobQueue {
  enqueue(name: string, payload: Record<string, unknown>): Promise<void> | void;
}

export interface WatchableRepo {
  id: string;
  kind: "local" | "remote";
  localPath?: string | null;
  syncStatus: string;
  archived: boolean;
}

export interface LocalRepoSource {
  listActiveLocal(): Promise<WatchableRepo[]>;
}

export interface RepoWatcherOptions {
  backend?: WatchBackend;
  debounceMs?: number;
}

class NodeFsWatchHandle implements WatchHandle {
  constructor(
    private readonly watcher: FSWatcher,
    private readonly interval: Timer,
  ) {}

  async close(): Promise<void> {
    this.watcher.close();
    clearInterval(this.interval);
  }
}

class NodeFsWatchBackend implements WatchBackend {
  readonly kind: "chokidar" | "parcel";

  constructor(kind: "chokidar" | "parcel" = "chokidar") {
    this.kind = kind;
  }

  watch(path: string, onEvent: (event: RepoWatchEvent, path: string) => void): WatchHandle {
    let snapshot = new Map<string, number>();
    snapshotTree(path).then((next) => {
      snapshot = next;
    }).catch(() => {
      snapshot = new Map();
    });
    const watcher = watch(path, { recursive: true }, (event, filename) => {
      if (event !== "rename" && event !== "change") return;
      onEvent(event === "rename" ? "add" : "change", filename?.toString() ?? path);
    });
    const interval = setInterval(async () => {
      const next = await snapshotTree(path);
      for (const [file, mtime] of next) {
        if (!snapshot.has(file)) onEvent("add", file);
        else if (snapshot.get(file) !== mtime) onEvent("change", file);
      }
      for (const file of snapshot.keys()) {
        if (!next.has(file)) onEvent("unlink", file);
      }
      snapshot = next;
    }, 50);
    return new NodeFsWatchHandle(watcher, interval);
  }
}

async function snapshotTree(root: string): Promise<Map<string, number>> {
  const entries = new Map<string, number>();
  await walk(root, root, entries);
  return entries;
}

async function walk(root: string, dir: string, entries: Map<string, number>): Promise<void> {
  let children: string[];
  try {
    children = await readdir(dir);
  } catch {
    return;
  }

  for (const child of children) {
    if (child === ".git") continue;
    const fullPath = join(dir, child);
    let info;
    try {
      info = await stat(fullPath);
    } catch {
      continue;
    }
    const relative = fullPath.slice(root.length + 1);
    if (info.isDirectory()) {
      await walk(root, fullPath, entries);
    } else {
      entries.set(relative, info.mtimeMs);
    }
  }
}

export function createWatchBackend(kind: "chokidar" | "parcel" = "chokidar"): WatchBackend {
  return new NodeFsWatchBackend(kind);
}

export class RepoWatcher {
  private handle: WatchHandle | null = null;
  private debounceTimer: Timer | null = null;
  private readonly backend: WatchBackend;
  private readonly debounceMs: number;

  constructor(
    private readonly repo: WatchableRepo,
    private readonly queue: JobQueue,
    options: RepoWatcherOptions = {},
  ) {
    this.backend = options.backend ?? createWatchBackend(process.env["FULCRUM_REPO_WATCHER_BACKEND"] === "parcel" ? "parcel" : "chokidar");
    this.debounceMs = options.debounceMs ?? 300;
  }

  get active(): boolean {
    return this.handle !== null;
  }

  async start(): Promise<void> {
    if (this.handle) return;
    if (this.repo.kind !== "local" || !this.repo.localPath || this.repo.archived) return;

    this.handle = await this.backend.watch(this.repo.localPath, (event) => {
      if (event === "add" || event === "change" || event === "unlink") {
        this.scheduleSync();
      }
    });
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const handle = this.handle;
    this.handle = null;
    await handle?.close();
  }

  private scheduleSync(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      await this.queue.enqueue("repo.sync.local", { repoId: this.repo.id });
    }, this.debounceMs);
  }
}

export class WatcherRegistry {
  private readonly watchers = new Map<string, RepoWatcher>();
  private readonly options: RepoWatcherOptions;

  constructor(
    private readonly repos: LocalRepoSource,
    private readonly queue: JobQueue,
    options: RepoWatcherOptions = {},
  ) {
    this.options = options;
  }

  get count(): number {
    return this.watchers.size;
  }

  async startAll(): Promise<void> {
    for (const repo of await this.repos.listActiveLocal()) {
      await this.start(repo.id);
    }
  }

  async start(id: string): Promise<void> {
    if (this.watchers.has(id)) return;
    const repo = (await this.repos.listActiveLocal()).find((row) => row.id === id);
    if (!repo || repo.kind !== "local" || !repo.localPath || repo.archived) return;

    const watcher = new RepoWatcher(repo, this.queue, this.options);
    await watcher.start();
    if (watcher.active) this.watchers.set(id, watcher);
  }

  async stop(id: string): Promise<void> {
    const watcher = this.watchers.get(id);
    if (!watcher) return;
    this.watchers.delete(id);
    await watcher.stop();
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.watchers.keys()].map((id) => this.stop(id)));
  }
}

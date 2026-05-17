import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export type RepoWatchEvent = "add" | "change" | "unlink";

export interface WatchHandle {
  stop?(): Promise<void> | void;
  close?(): Promise<void> | void;
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

export interface RepoWatcherLogger {
  warn(message: string, context?: Record<string, unknown>): void;
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
  logger?: RepoWatcherLogger;
}

class NodeFsWatchHandle implements WatchHandle {
  constructor(
    private readonly watcher: FSWatcher,
    private readonly interval: Timer,
  ) {}

  async stop(): Promise<void> {
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
  private readonly pendingEvents = new Map<string, {
    timer: Timer;
    payload: RepoWatchPayload;
    inFlight: boolean;
  }>();
  private readonly backend: WatchBackend;
  private readonly debounceMs: number;
  private readonly logger: RepoWatcherLogger;

  constructor(
    private readonly repo: WatchableRepo,
    private readonly queue: JobQueue,
    options: RepoWatcherOptions = {},
  ) {
    this.backend = options.backend ?? createWatchBackend(process.env["FULCRUM_REPO_WATCHER_BACKEND"] === "parcel" ? "parcel" : "chokidar");
    this.debounceMs = options.debounceMs ?? 250;
    this.logger = options.logger ?? { warn() {} };
  }

  get active(): boolean {
    return this.handle !== null;
  }

  async start(): Promise<void> {
    if (this.handle) return;
    if (this.repo.kind !== "local" || !this.repo.localPath || this.repo.archived) return;

    const root = resolve(this.repo.localPath);
    this.handle = await this.backend.watch(root, (event, filename) => {
      if (event === "add" || event === "change" || event === "unlink") {
        const safeFilename = this.safeRelativePath(root, filename);
        if (!safeFilename) return;
        this.scheduleSync({ repoId: this.repo.id, filename: safeFilename, eventType: event });
      }
    });
  }

  async stop(): Promise<void> {
    for (const event of this.pendingEvents.values()) {
      clearTimeout(event.timer);
    }
    this.pendingEvents.clear();
    const handle = this.handle;
    this.handle = null;
    if (handle?.stop) await handle.stop();
    else await handle?.close?.();
  }

  private scheduleSync(payload: RepoWatchPayload): void {
    const key = payload.filename;
    const existing = this.pendingEvents.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.payload = payload;
      existing.timer = setTimeout(() => void this.flushSync(key), this.debounceMs);
      return;
    }

    this.pendingEvents.set(key, {
      payload,
      inFlight: false,
      timer: setTimeout(() => void this.flushSync(key), this.debounceMs),
    });
  }

  private async flushSync(key: string): Promise<void> {
    const event = this.pendingEvents.get(key);
    if (!event || event.inFlight) return;
    event.inFlight = true;
    try {
      await this.queue.enqueue("repo.sync.local", event.payload);
      this.pendingEvents.delete(key);
    } catch {
      await this.queue.enqueue("repo.sync.local", { ...event.payload, retryable: true });
      this.pendingEvents.delete(key);
    }
  }

  private safeRelativePath(root: string, filename: string): string | null {
    if (!filename || filename.includes("\0")) {
      this.logger.warn("ignored repo watcher event outside registered root", {
        repoId: this.repo.id,
        filename,
      });
      return null;
    }

    const absolute = resolve(root, filename);
    if (absolute !== root && !absolute.startsWith(`${root}/`)) {
      this.logger.warn("ignored repo watcher event outside registered root", {
        repoId: this.repo.id,
        filename,
      });
      return null;
    }

    return absolute === root ? "." : absolute.slice(root.length + 1);
  }
}

export interface RepoWatchPayload {
  [key: string]: string;
  repoId: string;
  filename: string;
  eventType: RepoWatchEvent;
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

import { basename, resolve } from "node:path";

import type { WatcherRegistry, WatchableRepo } from "./watcher.ts";

export interface RegisteredRepo extends WatchableRepo {
  name?: string;
  slug?: string;
  projectId?: string | null;
  remoteUrl?: string | null;
}

export interface RepoStore {
  createLocal(input: {
    localPath: string;
    projectId?: string | null;
    name?: string;
    slug?: string;
  }): Promise<RegisteredRepo>;
  createRemote(input: {
    remoteUrl: string;
    projectId?: string | null;
    name?: string;
    slug?: string;
  }): Promise<RegisteredRepo>;
  listActiveLocal(): Promise<RegisteredRepo[]>;
  archive(id: string): Promise<RegisteredRepo | null>;
}

export interface RepoAddInput {
  path: string;
  projectId?: string | null;
}

export interface RepoAddRemoteInput {
  url: string;
  projectId?: string | null;
  name?: string;
}

export class RepoRegistrationService {
  constructor(
    private readonly repos: RepoStore,
    private readonly watchers: Pick<WatcherRegistry, "start" | "stop">,
  ) {}

  async add(input: RepoAddInput): Promise<RegisteredRepo> {
    const localPath = resolve(input.path);
    const slug = basename(localPath);
    const repo = await this.repos.createLocal({
      localPath,
      projectId: input.projectId ?? null,
      name: slug,
      slug,
    });

    await this.watchers.start(repo.id);
    return repo;
  }

  async addRemote(input: RepoAddRemoteInput): Promise<RegisteredRepo> {
    const slug = slugFromRemoteUrl(input.url);
    return this.repos.createRemote({
      remoteUrl: input.url,
      projectId: input.projectId ?? null,
      name: input.name ?? slug,
      slug,
    });
  }

  async remove(id: string): Promise<RegisteredRepo | null> {
    await this.watchers.stop(id);
    return this.repos.archive(id);
  }
}

function slugFromRemoteUrl(url: string): string {
  const withoutTrailingSlash = url.replace(/\/$/, "");
  const lastSegment = withoutTrailingSlash.split(/[/:]/).filter(Boolean).at(-1) ?? "repo";
  return lastSegment.replace(/\.git$/, "") || "repo";
}

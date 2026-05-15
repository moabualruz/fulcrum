/**
 * RepoRepository — repos domain (Pillar 9).
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "node:crypto";
import { Repo } from "@integration-hub/infrastructure/database/entities/repos/Repo.ts";

export interface RepoCreateInput {
  orgId: string;
  name: string;
  slug: string;
  kind: "local" | "remote";
  localPath?: string | null;
  remoteUrl?: string | null;
  defaultBranch?: string | null;
  currentBranch?: string | null;
}

export interface RepoListInput {
  orgId: string;
  includeArchived?: boolean;
}

export interface RepoGetInput {
  orgId: string;
  id: string;
}

export interface RepoUpdateInput {
  orgId: string;
  id: string;
  name?: string;
  slug?: string;
  kind?: "local" | "remote";
  localPath?: string | null;
  remoteUrl?: string | null;
  defaultBranch?: string | null;
  currentBranch?: string | null;
  lastSyncAt?: Date | null;
  syncStatus?: "idle" | "syncing" | "error";
  lastTouchedAt?: Date | null;
}

@Injectable()
export class RepoRepository {
  constructor(
    @InjectRepository(Repo)
    private readonly repos: Repository<Repo>,
  ) {}

  create(input: RepoCreateInput): Repo {
    return this.repos.create({
      id: randomUUID(),
      org: { id: input.orgId } as any,
      name: input.name,
      slug: input.slug,
      kind: input.kind,
      localPath: input.localPath ?? null,
      remoteUrl: input.remoteUrl ?? null,
      defaultBranch: input.defaultBranch ?? "main",
      currentBranch: input.currentBranch ?? input.defaultBranch ?? "main",
      syncStatus: "idle",
      lastTouchedAt: new Date(),
      archived: false,
    });
  }

  async list(input: RepoListInput): Promise<Repo[]> {
    return this.repos.find({
      where: {
        org: { id: input.orgId },
        ...(input.includeArchived ? {} : { archived: false }),
      },
      order: { lastTouchedAt: "DESC", name: "ASC" },
    });
  }

  async get(input: RepoGetInput): Promise<Repo | null> {
    return this.repos.findOne({
      where: { org: { id: input.orgId }, id: input.id },
    });
  }

  async update(input: RepoUpdateInput): Promise<Repo | null> {
    const repo = await this.get(input);
    if (!repo) return null;

    if (input.name !== undefined) repo.name = input.name;
    if (input.slug !== undefined) repo.slug = input.slug;
    if (input.kind !== undefined) repo.kind = input.kind;
    if (input.localPath !== undefined) repo.localPath = input.localPath;
    if (input.remoteUrl !== undefined) repo.remoteUrl = input.remoteUrl;
    if (input.defaultBranch !== undefined) repo.defaultBranch = input.defaultBranch;
    if (input.currentBranch !== undefined) repo.currentBranch = input.currentBranch;
    if (input.lastSyncAt !== undefined) repo.lastSyncAt = input.lastSyncAt;
    if (input.syncStatus !== undefined) repo.syncStatus = input.syncStatus;
    repo.lastTouchedAt = input.lastTouchedAt ?? new Date();

    return this.repos.save(repo);
  }

  async archive(input: RepoGetInput): Promise<Repo | null> {
    const repo = await this.get(input);
    if (!repo) return null;

    repo.archived = true;
    repo.lastTouchedAt = new Date();
    return this.repos.save(repo);
  }
}

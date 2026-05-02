/**
 * RepoRepository — repos domain (Pillar 9).
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Repo>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { EntityData } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";
import { Repo } from "../../entities/repos/Repo.ts";
import { Org } from "../../entities/auth/Org.ts";

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

@injectable()
export class RepoRepository extends EntityRepository<Repo> {
  override create(input: RepoCreateInput | EntityData<Repo>): Repo {
    if (!("orgId" in input)) {
      return super.create(input as never);
    }

    const em = this.getEntityManager();
    const repo = super.create({
      id: randomUUID(),
      org: em.getReference(Org, input.orgId),
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

    em.persist(repo);
    return repo;
  }

  async list(input: RepoListInput): Promise<Repo[]> {
    await this.getEntityManager().flush();
    return this.find(
      {
        org: input.orgId,
        ...(input.includeArchived ? {} : { archived: false }),
      } as never,
      { orderBy: { lastTouchedAt: "DESC", name: "ASC" } },
    );
  }

  async get(input: RepoGetInput): Promise<Repo | null> {
    await this.getEntityManager().flush();
    return this.findOne({ org: input.orgId, id: input.id } as never);
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

    this.getEntityManager().persist(repo);
    await this.getEntityManager().flush();
    return repo;
  }

  async archive(input: RepoGetInput): Promise<Repo | null> {
    const repo = await this.get(input);
    if (!repo) return null;

    repo.archived = true;
    repo.lastTouchedAt = new Date();
    this.getEntityManager().persist(repo);
    await this.getEntityManager().flush();
    return repo;
  }
}

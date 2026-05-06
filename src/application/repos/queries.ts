import type { EntityManager } from "@mikro-orm/postgresql";
import { Repo } from "../../db/entities/repos/Repo.ts";
import { RepoTreeEntry } from "../../db/entities/repos/RepoTreeEntry.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import type { AppContext, RepoDto, RepoTreeEntryDto } from "./types.ts";

export async function listRepos(em: EntityManager, ctx: AppContext): Promise<RepoDto[]> {
  return (await em.find(Repo, { org: ctx.orgId, archived: false } as never, { orderBy: { slug: "ASC" } })).map(serializeRepo);
}

export async function getRepo(em: EntityManager, ctx: AppContext, id: string): Promise<RepoDto> {
  const repo = await em.findOne(Repo, { id } as never);
  if (!repo) throw new AppNotFoundError(`Repo not found: ${id}`);
  if (repo.org.id !== ctx.orgId) throw new AppForbiddenError("Repo is outside org scope.");
  return serializeRepo(repo);
}

export async function listRepoTree(em: EntityManager, ctx: AppContext, input: { repoId: string; commitSha: string }): Promise<RepoTreeEntryDto[]> {
  await getRepo(em, ctx, input.repoId);
  return (await em.find(RepoTreeEntry, { org: ctx.orgId, repo: input.repoId, commitSha: input.commitSha } as never, { orderBy: { path: "ASC" } })).map(serializeRepoTreeEntry);
}

export function serializeRepo(repo: Repo): RepoDto {
  return { id: repo.id, orgId: repo.org.id, slug: repo.slug, name: repo.name, kind: repo.kind, localPath: repo.localPath ?? null };
}

export function serializeRepoTreeEntry(row: RepoTreeEntry): RepoTreeEntryDto {
  return { id: row.id, orgId: row.org.id, repoId: row.repo.id, commitSha: row.commitSha, path: row.path, kind: row.kind };
}

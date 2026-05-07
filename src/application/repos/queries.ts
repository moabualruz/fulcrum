import type { EntityManager } from "@mikro-orm/postgresql";
import { Repo } from "../../db/entities/repos/Repo.ts";
import { RepoTreeEntry } from "../../db/entities/repos/RepoTreeEntry.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import { ormSqlConnection } from "../orm-helpers.ts";
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

export interface ProjectRepoCard {
  id: string;
  name: string;
  slug: string;
  kind: "local" | "remote";
  currentBranch: string | null;
  syncStatus: "idle" | "syncing" | "error";
  remoteUrl: string | null;
  localPath: string | null;
  openTaskCount: number;
  lastCommits: Array<{ subject: string; relativeTime: string }>;
}

interface ProjectRepoRow {
  id: string;
  name: string | null;
  slug: string;
  kind: string | null;
  current_branch: string | null;
  sync_status: string | null;
  remote_url: string | null;
  local_path: string | null;
}

export async function listProjectRepoCards(em: EntityManager, ctx: AppContext): Promise<ProjectRepoCard[]> {
  const rows = await ormSqlConnection(em).execute<ProjectRepoRow[]>(
    `SELECT id, name, slug, kind, current_branch, sync_status, remote_url, local_path
       FROM repos
      WHERE org_id = $1
        AND project_id = $2
      ORDER BY name ASC, slug ASC`,
    [ctx.orgId, ctx.projectId ?? null],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name || row.slug,
    slug: row.slug,
    kind: row.kind === "remote" ? "remote" : "local",
    currentBranch: row.current_branch,
    syncStatus: row.sync_status === "syncing" || row.sync_status === "error" ? row.sync_status : "idle",
    remoteUrl: row.remote_url,
    localPath: row.local_path,
    openTaskCount: 0,
    lastCommits: [],
  }));
}

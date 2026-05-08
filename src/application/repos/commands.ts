import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { Org } from "../../db/entities/auth/Org.ts";
import { Repo } from "../../db/entities/repos/Repo.ts";
import { RepoBranch } from "../../db/entities/repos/RepoBranch.ts";
import { RepoTreeEntry } from "../../db/entities/repos/RepoTreeEntry.ts";
import { AppForbiddenError, AppValidationError } from "../errors.ts";
import { ormSqlConnection } from "../orm-helpers.ts";
import { getRepo, isRepoWriteOpsEnabled, serializeRepo, serializeRepoTreeEntry } from "./queries.ts";
import type { AppContext, InsertRepoTreeEntryInput, RegisterRepoInput, RepoDto, RepoTreeEntryDto } from "./types.ts";

export async function registerRepo(em: EntityManager, ctx: AppContext, input: RegisterRepoInput): Promise<RepoDto> {
  if (!input.slug || !input.name) throw new AppValidationError("Repo slug and name are required.");
  return await em.transactional(async (txEm) => {
    const repo = txEm.create(Repo, { org: txEm.getReference(Org, ctx.orgId), slug: input.slug, name: input.name, kind: input.kind, localPath: input.localPath ?? null, remoteUrl: input.remoteUrl ?? null });
    txEm.persist(repo);
    await txEm.flush();
    return serializeRepo(repo);
  });
}

export async function insertRepoTreeEntry(em: EntityManager, ctx: AppContext, input: InsertRepoTreeEntryInput): Promise<RepoTreeEntryDto> {
  if (!input.repoId || !input.commitSha || !input.path || !input.kind) throw new AppValidationError("Repo tree repoId, commitSha, path, and kind are required.");
  return await em.transactional(async (txEm) => {
    const row = txEm.create(RepoTreeEntry, { org: txEm.getReference(Org, ctx.orgId), projectId: ctx.projectId ?? "00000000-0000-4000-8000-000000000000", repo: txEm.getReference(Repo, input.repoId), commitSha: input.commitSha, path: input.path, kind: input.kind });
    txEm.persist(row);
    await txEm.flush();
    return serializeRepoTreeEntry(row);
  });
}

export async function addProjectRepo(
  em: EntityManager,
  ctx: AppContext,
  input: { kind: "local" | "remote"; path?: string | null; url?: string | null; name?: string | null },
): Promise<{ id: string }> {
  const kind = input.kind === "remote" ? "remote" : "local";
  const path = (input.path ?? "").trim();
  const url = (input.url ?? "").trim();
  const name = (input.name ?? "").trim();
  if (kind === "local" && !path) throw new AppValidationError("path required");
  if (kind === "remote" && !url) throw new AppValidationError("url required");

  const resolvedPath = kind === "local" ? resolve(path) : null;
  const slug = kind === "local" ? basename(resolvedPath ?? "repo") : slugFromRemoteUrl(url);
  const displayName = name || (kind === "local" ? basename(resolvedPath ?? "repo") : slugFromRemoteUrl(url));
  const id = randomUUID();
  const rows = await ormSqlConnection(em).execute<Array<{ id: string }>>(
    `INSERT INTO repos (id, org_id, project_id, slug, default_branch, remote_url, name, kind, local_path, current_branch, sync_status, last_touched_at)
     VALUES ($1, $2, $3, $4, 'main', $5, $6, $7, $8, 'main', 'idle', now())
     RETURNING id`,
    [
      id,
      ctx.orgId,
      ctx.projectId ?? null,
      slug,
      kind === "remote" ? url : null,
      displayName,
      kind,
      resolvedPath,
    ],
  );
  return { id: rows[0]!.id };
}

export async function linkProjectRepoToProject(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
): Promise<{ ok: true }> {
  if (!repoId) throw new AppValidationError("repoId required");
  await getRepo(em, ctx, repoId);
  await ormSqlConnection(em).execute(
    `UPDATE repos SET project_id = $1, last_touched_at = now() WHERE id = $2 AND org_id = $3`,
    [ctx.projectId ?? null, repoId, ctx.orgId],
  );
  return { ok: true };
}

export async function touchRepoSync(em: EntityManager, ctx: AppContext, repoId: string): Promise<{ ok: true }> {
  await em.getKysely<any>()
    .updateTable("repos")
    .set({ last_sync_at: new Date(), last_touched_at: new Date() })
    .where("id", "=", repoId)
    .where("org_id", "=", ctx.orgId)
    .execute();
  return { ok: true };
}

export async function createRepoBranch(em: EntityManager, ctx: AppContext, input: { repoId: string; name: string }): Promise<{ ok: true }> {
  await requireRepoWriteOps(em, ctx);
  if (!input.name) throw new AppValidationError("branch name required");
  await em.transactional(async (txEm) => {
    const branch = txEm.create(RepoBranch, {
      org: txEm.getReference(Org, ctx.orgId),
      repo: txEm.getReference(Repo, input.repoId),
      name: input.name,
      sha: null,
      isDefault: false,
    });
    txEm.persist(branch);
    await txEm.flush();
  });
  return { ok: true };
}

export async function checkoutRepoBranch(em: EntityManager, ctx: AppContext, input: { repoId: string; name: string }): Promise<{ ok: true }> {
  await requireRepoWriteOps(em, ctx);
  await em.getKysely<any>()
    .updateTable("repos")
    .set({ current_branch: input.name, last_touched_at: new Date() })
    .where("id", "=", input.repoId)
    .where("org_id", "=", ctx.orgId)
    .execute();
  return { ok: true };
}

export async function deleteRepoBranch(em: EntityManager, ctx: AppContext, input: { repoId: string; name: string }): Promise<{ ok: true }> {
  await requireRepoWriteOps(em, ctx);
  await em.getKysely<any>()
    .deleteFrom("repo_branches")
    .where("org_id", "=", ctx.orgId)
    .where("repo_id", "=", input.repoId)
    .where("name", "=", input.name)
    .where("is_default", "=", false)
    .execute();
  return { ok: true };
}

async function requireRepoWriteOps(em: EntityManager, ctx: AppContext): Promise<void> {
  if (!(await isRepoWriteOpsEnabled(em, ctx))) throw new AppForbiddenError("repo-write-ops disabled");
}

function slugFromRemoteUrl(url: string): string {
  const segment =
    url
      .replace(/\/$/, "")
      .split(/[/:]/)
      .filter(Boolean)
      .at(-1) ?? "repo";
  return segment.replace(/\.git$/, "") || "repo";
}

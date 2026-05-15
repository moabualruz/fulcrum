import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Repo } from "@integration-hub/infrastructure/database/entities/repos/Repo.ts";
import { RepoBranch } from "@integration-hub/infrastructure/database/entities/repos/RepoBranch.ts";
import { RepoTreeEntry } from "@integration-hub/infrastructure/database/entities/repos/RepoTreeEntry.ts";
import { AppForbiddenError, AppValidationError } from "@platform-core/domain/errors.ts";
import { ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import { getRepo, isRepoWriteOpsEnabled, serializeRepo, serializeRepoTreeEntry } from "@integration-hub/application/repos/queries.ts";
import type { AppContext, InsertRepoTreeEntryInput, RegisterRepoInput, RepoDto, RepoTreeEntryDto } from "@integration-hub/domain/repository.ts";

export async function registerRepo(em: EntityManager, ctx: AppContext, input: RegisterRepoInput): Promise<RepoDto> {
  if (!input.slug || !input.name) throw new AppValidationError("Repo slug and name are required.");
  return await em.transaction(async (txEm: EntityManager) => {
    const repo = txEm.create(Repo, { org: { id: ctx.orgId } as Org, slug: input.slug, name: input.name, kind: input.kind, localPath: input.localPath ?? null, remoteUrl: input.remoteUrl ?? null });
    await txEm.save(repo);
    return serializeRepo(repo);
  });
}

export async function insertRepoTreeEntry(em: EntityManager, ctx: AppContext, input: InsertRepoTreeEntryInput): Promise<RepoTreeEntryDto> {
  if (!input.repoId || !input.commitSha || !input.path || !input.kind) throw new AppValidationError("Repo tree repoId, commitSha, path, and kind are required.");
  return await em.transaction(async (txEm: EntityManager) => {
    const row = txEm.create(RepoTreeEntry, { org: { id: ctx.orgId } as Org, projectId: ctx.projectId ?? "00000000-0000-4000-8000-000000000000", repo: { id: input.repoId } as Repo, commitSha: input.commitSha, path: input.path, kind: input.kind });
    await txEm.save(row);
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
  const now = new Date();
  await ormSqlConnection(em).execute(
    `UPDATE repos SET last_sync_at = ?, last_touched_at = ? WHERE id = ? AND org_id = ?`,
    [now, now, repoId, ctx.orgId],
  );
  return { ok: true };
}

export async function createRepoBranch(em: EntityManager, ctx: AppContext, input: { repoId: string; name: string }): Promise<{ ok: true }> {
  await requireRepoWriteOps(em, ctx);
  if (!input.name) throw new AppValidationError("branch name required");
  await em.transaction(async (txEm: EntityManager) => {
    const branch = txEm.create(RepoBranch, {
      org: { id: ctx.orgId } as Org,
      repo: { id: input.repoId } as Repo,
      name: input.name,
      sha: null,
      isDefault: false,
    });
    await txEm.save(branch);
  });
  return { ok: true };
}

export async function checkoutRepoBranch(em: EntityManager, ctx: AppContext, input: { repoId: string; name: string }): Promise<{ ok: true }> {
  await requireRepoWriteOps(em, ctx);
  await ormSqlConnection(em).execute(
    `UPDATE repos SET current_branch = ?, last_touched_at = ? WHERE id = ? AND org_id = ?`,
    [input.name, new Date(), input.repoId, ctx.orgId],
  );
  return { ok: true };
}

export async function deleteRepoBranch(em: EntityManager, ctx: AppContext, input: { repoId: string; name: string }): Promise<{ ok: true }> {
  await requireRepoWriteOps(em, ctx);
  await ormSqlConnection(em).execute(
    `DELETE FROM repo_branches WHERE org_id = ? AND repo_id = ? AND name = ? AND is_default = false`,
    [ctx.orgId, input.repoId, input.name],
  );
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

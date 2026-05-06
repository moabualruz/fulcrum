import type { EntityManager } from "@mikro-orm/postgresql";
import { Org } from "../../db/entities/auth/Org.ts";
import { Repo } from "../../db/entities/repos/Repo.ts";
import { RepoTreeEntry } from "../../db/entities/repos/RepoTreeEntry.ts";
import { AppValidationError } from "../errors.ts";
import { serializeRepo, serializeRepoTreeEntry } from "./queries.ts";
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

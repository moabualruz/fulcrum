import type { EntityManager } from "typeorm";

import type { AppContext } from "@integration-hub/domain/repository.ts";
import type { ProjectRepoCard } from "@integration-hub/application/repos/queries.ts";

export type { ProjectRepoCard };

export async function listProjectRepoCards(
  em: EntityManager,
  ctx: AppContext,
): Promise<ProjectRepoCard[]> {
  const queries = await import("@integration-hub/application/repos/queries.ts");
  return queries.listProjectRepoCards(em, ctx);
}

export async function addProjectRepo(
  em: EntityManager,
  ctx: AppContext,
  input: { kind: "local" | "remote"; path?: string | null; url?: string | null; name?: string | null },
): Promise<{ id: string }> {
  const commands = await import("@integration-hub/application/repos/commands.ts");
  return commands.addProjectRepo(em, ctx, input);
}

export async function linkProjectRepoToProject(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
): Promise<{ ok: true }> {
  const commands = await import("@integration-hub/application/repos/commands.ts");
  return commands.linkProjectRepoToProject(em, ctx, repoId);
}

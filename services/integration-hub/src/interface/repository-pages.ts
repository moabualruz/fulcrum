import type { EntityManager } from "typeorm";

import type { AppContext } from "@integration-hub/domain/repository.ts";
import type { RepoDashboardDetail, RepoDashboardRow } from "@integration-hub/application/repos/dashboard.ts";
import type {
  RepoBranchPageData,
  RepoCommitDetailData,
  RepoCommitsPageData,
  RepoListRow,
} from "@integration-hub/application/repos/queries.ts";

export type {
  RepoBranchPageData,
  RepoCommitDetailData,
  RepoCommitsPageData,
  RepoDashboardDetail,
  RepoDashboardRow,
  RepoListRow,
};

export const REPOSITORY_WRITE_ACTIONS_GATE = {
  code: "FEATURE_GATED" as const,
  message: "Write operations disabled. Enable repo-write-ops to create, checkout, or delete branches.",
};

export async function listRepositoryPageRows(
  em: EntityManager,
  ctx: AppContext,
): Promise<RepoListRow[]> {
  const queries = await import("@integration-hub/application/repos/queries.ts");
  return queries.listRepoPageRows(em, ctx);
}

export async function listRepositoryDashboard(orgId: string): Promise<RepoDashboardRow[]> {
  const dashboard = await import("@integration-hub/application/repos/dashboard.ts");
  return dashboard.getRepoDashboard(orgId);
}

export async function loadRepositoryDetail(orgId: string, repoId: string): Promise<RepoDashboardDetail> {
  const dashboard = await import("@integration-hub/application/repos/dashboard.ts");
  return dashboard.getRepoDetail(orgId, repoId);
}

export async function loadRepositoryBranchesPage(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
): Promise<RepoBranchPageData> {
  const queries = await import("@integration-hub/application/repos/queries.ts");
  return queries.getRepoBranchesPage(em, ctx, repoId);
}

export async function createRepositoryBranch(
  em: EntityManager,
  ctx: AppContext,
  input: { repoId: string; name: string },
): Promise<{ ok: true }> {
  const commands = await import("@integration-hub/application/repos/commands.ts");
  return commands.createRepoBranch(em, ctx, input);
}

export async function checkoutRepositoryBranch(
  em: EntityManager,
  ctx: AppContext,
  input: { repoId: string; name: string },
): Promise<{ ok: true }> {
  const commands = await import("@integration-hub/application/repos/commands.ts");
  return commands.checkoutRepoBranch(em, ctx, input);
}

export async function deleteRepositoryBranch(
  em: EntityManager,
  ctx: AppContext,
  input: { repoId: string; name: string },
): Promise<{ ok: true }> {
  const commands = await import("@integration-hub/application/repos/commands.ts");
  return commands.deleteRepoBranch(em, ctx, input);
}

export async function loadRepositoryCommitsPage(
  em: EntityManager,
  ctx: AppContext,
  input: { repoId: string; page: number; pageSize: number },
): Promise<RepoCommitsPageData> {
  const queries = await import("@integration-hub/application/repos/queries.ts");
  return queries.getRepoCommitsPage(em, ctx, input);
}

export async function loadRepositoryCommitDetail(
  em: EntityManager,
  ctx: AppContext,
  input: { repoId: string; sha: string; view: "split" | "unified" },
): Promise<RepoCommitDetailData> {
  const queries = await import("@integration-hub/application/repos/queries.ts");
  return queries.getRepoCommitDetail(em, ctx, input);
}

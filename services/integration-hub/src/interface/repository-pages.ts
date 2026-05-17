import type { AppContext } from "@integration-hub/domain/repository.ts";
import type { RepoDashboardDetail, RepoDashboardRow } from "@integration-hub/application/repos/dashboard.ts";
import type {
  RepoBranchPageData,
  RepoCommitDetailData,
  RepoCommitsPageData,
  RepoListRow,
} from "@integration-hub/application/repos/queries.ts";
import { initDataSource } from "@platform-core/infrastructure/application-database/typeorm.config.ts";

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

export interface RepositoryRequestContextInput {
  orgId: string;
  userId?: string | null;
  projectId?: string | null;
}

export async function listRepositoryPageRows(input: RepositoryRequestContextInput): Promise<RepoListRow[]> {
  const queries = await import("@integration-hub/application/repos/queries.ts");
  const em = await repositoryManager();
  const ctx = repositoryContext(input);
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
  input: RepositoryRequestContextInput,
  repoId: string,
): Promise<RepoBranchPageData> {
  const queries = await import("@integration-hub/application/repos/queries.ts");
  const em = await repositoryManager();
  const ctx = repositoryContext(input);
  return queries.getRepoBranchesPage(em, ctx, repoId);
}

export async function createRepositoryBranch(
  contextInput: RepositoryRequestContextInput,
  input: { repoId: string; name: string },
): Promise<{ ok: true }> {
  const commands = await import("@integration-hub/application/repos/commands.ts");
  const em = await repositoryManager();
  const ctx = repositoryContext(contextInput);
  return commands.createRepoBranch(em, ctx, input);
}

export async function checkoutRepositoryBranch(
  contextInput: RepositoryRequestContextInput,
  input: { repoId: string; name: string },
): Promise<{ ok: true }> {
  const commands = await import("@integration-hub/application/repos/commands.ts");
  const em = await repositoryManager();
  const ctx = repositoryContext(contextInput);
  return commands.checkoutRepoBranch(em, ctx, input);
}

export async function deleteRepositoryBranch(
  contextInput: RepositoryRequestContextInput,
  input: { repoId: string; name: string },
): Promise<{ ok: true }> {
  const commands = await import("@integration-hub/application/repos/commands.ts");
  const em = await repositoryManager();
  const ctx = repositoryContext(contextInput);
  return commands.deleteRepoBranch(em, ctx, input);
}

export async function loadRepositoryCommitsPage(
  contextInput: RepositoryRequestContextInput,
  input: { repoId: string; page: number; pageSize: number },
): Promise<RepoCommitsPageData> {
  const queries = await import("@integration-hub/application/repos/queries.ts");
  const em = await repositoryManager();
  const ctx = repositoryContext(contextInput);
  return queries.getRepoCommitsPage(em, ctx, input);
}

export async function loadRepositoryCommitDetail(
  contextInput: RepositoryRequestContextInput,
  input: { repoId: string; sha: string; view: "split" | "unified" },
): Promise<RepoCommitDetailData> {
  const queries = await import("@integration-hub/application/repos/queries.ts");
  const em = await repositoryManager();
  const ctx = repositoryContext(contextInput);
  return queries.getRepoCommitDetail(em, ctx, input);
}

async function repositoryManager() {
  return (await initDataSource()).manager;
}

function repositoryContext(input: RepositoryRequestContextInput): AppContext {
  return {
    orgId: input.orgId,
    userId: input.userId ?? null,
    projectId: input.projectId ?? null,
  };
}

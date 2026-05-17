import type { EntityManager } from "typeorm";
import { GitlabMergeRequest } from "@integration-hub/infrastructure/database/entities/connectors/GitlabMergeRequest.ts";
import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import type { AppContext, GitlabMergeRequestDto } from "@integration-hub/application/connectors/gitlab/types.ts";

export async function listGitlabMergeRequests(em: EntityManager, ctx: AppContext, input: { repoPath?: string } = {}): Promise<GitlabMergeRequestDto[]> {
  const rows = await em.find(GitlabMergeRequest, { where: { org: { id: ctx.orgId }, ...(input.repoPath ? { repoPath: input.repoPath } : {}) } as never, order: { updatedAt: "DESC", id: "ASC" } });
  return rows.map(serializeGitlabMergeRequest);
}

export async function getGitlabMergeRequest(em: EntityManager, ctx: AppContext, id: string): Promise<GitlabMergeRequestDto> {
  const row = await em.findOne(GitlabMergeRequest, { where: { id } as never });
  if (!row) throw new AppNotFoundError(`GitLab merge request not found: ${id}`);
  if (row.org.id !== ctx.orgId) throw new AppForbiddenError("GitLab merge request is outside org scope.");
  return serializeGitlabMergeRequest(row);
}

export function serializeGitlabMergeRequest(row: GitlabMergeRequest): GitlabMergeRequestDto {
  return { id: row.id, orgId: row.org.id, projectId: row.projectId, repoPath: row.repoPath, mergeRequestIid: row.mergeRequestIid, title: row.title, state: row.state };
}

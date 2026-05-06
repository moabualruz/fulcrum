import type { EntityManager } from "@mikro-orm/postgresql";
import { GitlabMergeRequest } from "../../../db/entities/connectors/GitlabMergeRequest.ts";
import { AppForbiddenError, AppNotFoundError } from "../../errors.ts";
import type { AppContext, GitlabMergeRequestDto } from "./types.ts";

export async function listGitlabMergeRequests(em: EntityManager, ctx: AppContext, input: { repoPath?: string } = {}): Promise<GitlabMergeRequestDto[]> {
  const rows = await em.find(GitlabMergeRequest, { org: ctx.orgId, ...(input.repoPath ? { repoPath: input.repoPath } : {}) } as never, { orderBy: { updatedAt: "DESC", id: "ASC" } });
  return rows.map(serializeGitlabMergeRequest);
}

export async function getGitlabMergeRequest(em: EntityManager, ctx: AppContext, id: string): Promise<GitlabMergeRequestDto> {
  const row = await em.findOne(GitlabMergeRequest, { id } as never);
  if (!row) throw new AppNotFoundError(`GitLab merge request not found: ${id}`);
  if (row.org.id !== ctx.orgId) throw new AppForbiddenError("GitLab merge request is outside org scope.");
  return serializeGitlabMergeRequest(row);
}

export function serializeGitlabMergeRequest(row: GitlabMergeRequest): GitlabMergeRequestDto {
  return { id: row.id, orgId: row.org.id, projectId: row.projectId, repoPath: row.repoPath, mergeRequestIid: row.mergeRequestIid, title: row.title, state: row.state };
}

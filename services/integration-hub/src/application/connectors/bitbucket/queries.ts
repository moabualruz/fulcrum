import type { EntityManager } from "typeorm";
import { BitbucketPullRequest } from "@integration-hub/infrastructure/database/entities/connectors/BitbucketPullRequest.ts";
import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import type { AppContext, BitbucketPullRequestDto } from "@integration-hub/application/connectors/bitbucket/types.ts";

export async function listBitbucketPullRequests(em: EntityManager, ctx: AppContext, input: { repoSlug?: string } = {}): Promise<BitbucketPullRequestDto[]> {
  const rows = await em.find(BitbucketPullRequest, { where: { org: { id: ctx.orgId }, ...(input.repoSlug ? { repoSlug: input.repoSlug } : {}) } as never, order: { updatedAt: "DESC", id: "ASC" } });
  return rows.map(serializeBitbucketPullRequest);
}

export async function getBitbucketPullRequest(em: EntityManager, ctx: AppContext, id: string): Promise<BitbucketPullRequestDto> {
  const row = await em.findOne(BitbucketPullRequest, { where: { id } as never });
  if (!row) throw new AppNotFoundError(`Bitbucket pull request not found: ${id}`);
  if (row.org.id !== ctx.orgId) throw new AppForbiddenError("Bitbucket pull request is outside org scope.");
  return serializeBitbucketPullRequest(row);
}

export function serializeBitbucketPullRequest(row: BitbucketPullRequest): BitbucketPullRequestDto {
  return { id: row.id, orgId: row.org.id, projectId: row.projectId, repoSlug: row.repoSlug, pullRequestId: row.pullRequestId, title: row.title, state: row.state };
}

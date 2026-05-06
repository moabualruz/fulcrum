import type { EntityManager } from "@mikro-orm/postgresql";
import { BitbucketPullRequest } from "../../../db/entities/connectors/BitbucketPullRequest.ts";
import { AppForbiddenError, AppNotFoundError } from "../../errors.ts";
import type { AppContext, BitbucketPullRequestDto } from "./types.ts";

export async function listBitbucketPullRequests(em: EntityManager, ctx: AppContext, input: { repoSlug?: string } = {}): Promise<BitbucketPullRequestDto[]> {
  const rows = await em.find(BitbucketPullRequest, { org: ctx.orgId, ...(input.repoSlug ? { repoSlug: input.repoSlug } : {}) } as never, { orderBy: { updatedAt: "DESC", id: "ASC" } });
  return rows.map(serializeBitbucketPullRequest);
}

export async function getBitbucketPullRequest(em: EntityManager, ctx: AppContext, id: string): Promise<BitbucketPullRequestDto> {
  const row = await em.findOne(BitbucketPullRequest, { id } as never);
  if (!row) throw new AppNotFoundError(`Bitbucket pull request not found: ${id}`);
  if (row.org.id !== ctx.orgId) throw new AppForbiddenError("Bitbucket pull request is outside org scope.");
  return serializeBitbucketPullRequest(row);
}

export function serializeBitbucketPullRequest(row: BitbucketPullRequest): BitbucketPullRequestDto {
  return { id: row.id, orgId: row.org.id, projectId: row.projectId, repoSlug: row.repoSlug, pullRequestId: row.pullRequestId, title: row.title, state: row.state };
}

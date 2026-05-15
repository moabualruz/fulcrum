import type { EntityManager } from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { BitbucketPullRequest } from "@integration-hub/infrastructure/database/entities/connectors/BitbucketPullRequest.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { serializeBitbucketPullRequest } from "@integration-hub/application/connectors/bitbucket/queries.ts";
import type { AppContext, BitbucketPullRequestDto, UpsertBitbucketPullRequestInput } from "@integration-hub/application/connectors/bitbucket/types.ts";

export async function upsertBitbucketPullRequest(em: EntityManager, ctx: AppContext, input: UpsertBitbucketPullRequestInput): Promise<BitbucketPullRequestDto> {
  if (!input.repoSlug || !input.pullRequestId || !input.title) throw new AppValidationError("Bitbucket pull request repoSlug, pullRequestId, and title are required.");
  return await em.transaction(async (txEm: EntityManager) => {
    let row = await txEm.findOne(BitbucketPullRequest, { org: ctx.orgId, repoSlug: input.repoSlug, pullRequestId: input.pullRequestId } as never);
    row ??= txEm.create(BitbucketPullRequest, { org: { id: ctx.orgId } as Org, projectId: ctx.projectId ?? "00000000-0000-4000-8000-000000000000", repoSlug: input.repoSlug, pullRequestId: input.pullRequestId, title: input.title, state: input.state });
    row.title = input.title;
    row.state = input.state;
    row.updatedAt = new Date();
    await txEm.save(row);
    return serializeBitbucketPullRequest(row);
  });
}

import type { EntityManager } from "@mikro-orm/postgresql";
import { Org } from "../../../db/entities/auth/Org.ts";
import { BitbucketPullRequest } from "../../../db/entities/connectors/BitbucketPullRequest.ts";
import { AppValidationError } from "../../errors.ts";
import { serializeBitbucketPullRequest } from "./queries.ts";
import type { AppContext, BitbucketPullRequestDto, UpsertBitbucketPullRequestInput } from "./types.ts";

export async function upsertBitbucketPullRequest(em: EntityManager, ctx: AppContext, input: UpsertBitbucketPullRequestInput): Promise<BitbucketPullRequestDto> {
  if (!input.repoSlug || !input.pullRequestId || !input.title) throw new AppValidationError("Bitbucket pull request repoSlug, pullRequestId, and title are required.");
  return await em.transactional(async (txEm) => {
    let row = await txEm.findOne(BitbucketPullRequest, { org: ctx.orgId, repoSlug: input.repoSlug, pullRequestId: input.pullRequestId } as never);
    row ??= txEm.create(BitbucketPullRequest, { org: txEm.getReference(Org, ctx.orgId), projectId: ctx.projectId ?? "00000000-0000-4000-8000-000000000000", repoSlug: input.repoSlug, pullRequestId: input.pullRequestId, title: input.title, state: input.state });
    row.title = input.title;
    row.state = input.state;
    row.updatedAt = new Date();
    txEm.persist(row);
    await txEm.flush();
    return serializeBitbucketPullRequest(row);
  });
}

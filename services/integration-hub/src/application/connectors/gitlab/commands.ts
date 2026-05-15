import type { EntityManager } from "typeorm";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { GitlabMergeRequest } from "@platform-core/infrastructure/application-database/entities/connectors/GitlabMergeRequest.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { serializeGitlabMergeRequest } from "@integration-hub/application/connectors/gitlab/queries.ts";
import type { AppContext, GitlabMergeRequestDto, UpsertGitlabMergeRequestInput } from "@integration-hub/application/connectors/gitlab/types.ts";

export async function upsertGitlabMergeRequest(em: EntityManager, ctx: AppContext, input: UpsertGitlabMergeRequestInput): Promise<GitlabMergeRequestDto> {
  if (!input.repoPath || !input.mergeRequestIid || !input.title) throw new AppValidationError("GitLab merge request repoPath, mergeRequestIid, and title are required.");
  return await em.transactional(async (txEm) => {
    let row = await txEm.findOne(GitlabMergeRequest, { org: ctx.orgId, repoPath: input.repoPath, mergeRequestIid: input.mergeRequestIid } as never);
    row ??= txEm.create(GitlabMergeRequest, { org: txEm.getReference(Org, ctx.orgId), projectId: ctx.projectId ?? "00000000-0000-4000-8000-000000000000", repoPath: input.repoPath, mergeRequestIid: input.mergeRequestIid, title: input.title, state: input.state });
    row.title = input.title;
    row.state = input.state;
    row.updatedAt = new Date();
    txEm.persist(row);
    await txEm.flush();
    return serializeGitlabMergeRequest(row);
  });
}

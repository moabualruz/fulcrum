import type { EntityManager } from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { GithubConnectorState } from "@integration-hub/infrastructure/database/entities/connectors/GithubConnectorState.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { serializeGithubConnectorState } from "@integration-hub/application/connectors/github/queries.ts";
import type { AppContext, GithubConnectorStateDto, UpsertGithubConnectorStateInput } from "@integration-hub/application/connectors/github/types.ts";

export async function upsertGithubConnectorState(em: EntityManager, ctx: AppContext, input: UpsertGithubConnectorStateInput): Promise<GithubConnectorStateDto> {
  if (!input.installationId || !input.repoFullName) throw new AppValidationError("GitHub installationId and repoFullName are required.");
  return await em.transaction(async (txEm: EntityManager) => {
    let row = await txEm.findOne(GithubConnectorState, { org: ctx.orgId, installationId: input.installationId, repoFullName: input.repoFullName } as never);
    row ??= txEm.create(GithubConnectorState, { org: { id: ctx.orgId } as Org, projectId: ctx.projectId ?? "00000000-0000-4000-8000-000000000000", installationId: input.installationId, repoFullName: input.repoFullName });
    row.cursor = input.cursor ?? null;
    row.updatedAt = new Date();
    await txEm.save(row);
    return serializeGithubConnectorState(row);
  });
}

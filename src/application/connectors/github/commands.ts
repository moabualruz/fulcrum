import type { EntityManager } from "@mikro-orm/postgresql";
import { Org } from "../../../db/entities/auth/Org.ts";
import { GithubConnectorState } from "../../../db/entities/connectors/GithubConnectorState.ts";
import { AppValidationError } from "../../errors.ts";
import { serializeGithubConnectorState } from "./queries.ts";
import type { AppContext, GithubConnectorStateDto, UpsertGithubConnectorStateInput } from "./types.ts";

export async function upsertGithubConnectorState(em: EntityManager, ctx: AppContext, input: UpsertGithubConnectorStateInput): Promise<GithubConnectorStateDto> {
  if (!input.installationId || !input.repoFullName) throw new AppValidationError("GitHub installationId and repoFullName are required.");
  return await em.transactional(async (txEm) => {
    let row = await txEm.findOne(GithubConnectorState, { org: ctx.orgId, installationId: input.installationId, repoFullName: input.repoFullName } as never);
    row ??= txEm.create(GithubConnectorState, { org: txEm.getReference(Org, ctx.orgId), projectId: ctx.projectId ?? "00000000-0000-4000-8000-000000000000", installationId: input.installationId, repoFullName: input.repoFullName });
    row.cursor = input.cursor ?? null;
    row.updatedAt = new Date();
    txEm.persist(row);
    await txEm.flush();
    return serializeGithubConnectorState(row);
  });
}

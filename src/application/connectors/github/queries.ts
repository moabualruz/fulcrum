import type { EntityManager } from "@mikro-orm/postgresql";
import { GithubConnectorState } from "../../../db/entities/connectors/GithubConnectorState.ts";
import { AppForbiddenError, AppNotFoundError } from "../../errors.ts";
import type { AppContext, GithubConnectorStateDto } from "./types.ts";

export async function listGithubConnectorStates(em: EntityManager, ctx: AppContext, input: { repoFullName?: string } = {}): Promise<GithubConnectorStateDto[]> {
  const rows = await em.find(GithubConnectorState, { org: ctx.orgId, ...(input.repoFullName ? { repoFullName: input.repoFullName } : {}) } as never, { orderBy: { updatedAt: "DESC", id: "ASC" } });
  return rows.map(serializeGithubConnectorState);
}

export async function getGithubConnectorState(em: EntityManager, ctx: AppContext, id: string): Promise<GithubConnectorStateDto> {
  const row = await em.findOne(GithubConnectorState, { id } as never);
  if (!row) throw new AppNotFoundError(`GitHub connector state not found: ${id}`);
  if (row.org.id !== ctx.orgId) throw new AppForbiddenError("GitHub connector state is outside org scope.");
  return serializeGithubConnectorState(row);
}

export function serializeGithubConnectorState(row: GithubConnectorState): GithubConnectorStateDto {
  return { id: row.id, orgId: row.org.id, projectId: row.projectId, installationId: row.installationId, repoFullName: row.repoFullName, cursor: row.cursor ?? null };
}

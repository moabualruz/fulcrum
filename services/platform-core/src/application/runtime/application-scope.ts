import type { EntityManager } from "typeorm";

import { resolveRequestOrgId } from "@identity-access/application/auth/request-scope.ts";
import { resolveProjectIdByKey } from "@work-management/application/projects/queries.ts";

export type ApplicationPersistence = EntityManager;

export interface ApplicationScopeInput {
  em?: ApplicationPersistence | null;
  orgId?: string | null;
  userId?: string | null;
}

export interface ApplicationScopeResult {
  em: ApplicationPersistence;
  ctx: {
    orgId: string;
    userId: string | null;
    projectId: string | null;
  };
}

export async function resolveApplicationScope(
  scope: ApplicationScopeInput | null | undefined,
  projectId?: string | null,
  taskId?: string | null,
  runId?: string | null,
): Promise<ApplicationScopeResult> {
  const em = scope?.em ?? null;
  if (!em) throw new Error("Application runtime unavailable");

  const orgId = await resolveRequestOrgId(em, {
    orgId: scope?.orgId,
    projectId,
    taskId,
    runId,
  });
  const ctx = { orgId, userId: scope?.userId ?? null };
  const resolvedProjectId = await resolveProjectIdByKey(em, ctx, projectId ?? null);

  return {
    em,
    ctx: {
      orgId,
      userId: ctx.userId,
      projectId: resolvedProjectId,
    },
  };
}

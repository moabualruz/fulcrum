import { error } from "@sveltejs/kit";
import type { EntityManager } from "@mikro-orm/postgresql";

import { resolveOrgId } from "@/application/auth/org-context.ts";
import { resolveProjectIdByKey } from "@/application/projects/queries.ts";
import { initDatabase } from "$lib/server/db";

interface ApplicationScopeLocals {
  em?: EntityManager | null;
  orgId?: string | null;
  userId?: string | null;
}

let testScopeOverride: ApplicationScopeLocals | null = null;

export function __setApplicationScopeForTest(scope: ApplicationScopeLocals | null): () => void {
  const previous = testScopeOverride;
  testScopeOverride = scope;
  return () => {
    testScopeOverride = previous;
  };
}

export async function requestAppScope(locals?: ApplicationScopeLocals, projectId?: string | null) {
  const scope = locals?.em ? locals : testScopeOverride ?? locals;
  let em = scope?.em ?? null;
  if (!em) {
    const db = await initDatabase();
    em = db.em.fork();
  }
  if (!em) throw error(500, "Application runtime unavailable");
  const orgId = await resolveOrgId(em, scope?.orgId);
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

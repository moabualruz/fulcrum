import { error } from "@sveltejs/kit";
import type { EntityManager } from "@mikro-orm/postgresql";

import { resolveOrgId } from "../../../../application/auth/org-context.ts";

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
  const em = scope?.em;
  if (!em) throw error(500, "Application runtime unavailable");
  const orgId = await resolveOrgId(em, scope?.orgId);
  return {
    em,
    ctx: {
      orgId,
      userId: scope?.userId ?? null,
      projectId: projectId ?? null,
    },
  };
}

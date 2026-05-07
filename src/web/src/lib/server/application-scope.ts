import { error } from "@sveltejs/kit";
import type { EntityManager } from "@mikro-orm/postgresql";

import { resolveOrgId } from "../../../../application/auth/org-context.ts";

interface ApplicationScopeLocals {
  em?: EntityManager | null;
  orgId?: string | null;
  userId?: string | null;
}

export async function requestAppScope(locals: ApplicationScopeLocals, projectId?: string | null) {
  const em = locals.em;
  if (!em) throw error(500, "Application runtime unavailable");
  const orgId = await resolveOrgId(em, locals.orgId);
  return {
    em,
    ctx: {
      orgId,
      userId: locals.userId ?? null,
      projectId: projectId ?? null,
    },
  };
}

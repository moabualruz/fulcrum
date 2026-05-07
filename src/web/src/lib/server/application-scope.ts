import { error } from "@sveltejs/kit";

import { resolveOrgId } from "../../../../application/auth/org-context.ts";

export async function requestAppScope(locals: App.Locals, projectId?: string | null) {
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

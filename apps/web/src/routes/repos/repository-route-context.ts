import { activeOrgId } from "$lib/server/public-api";

export function repositoryRouteContext(locals: App.Locals | undefined, projectId: string | null = null) {
  const routeLocals = locals ?? ({} as App.Locals);
  return {
    orgId: activeOrgId(routeLocals),
    userId: activeUserId(routeLocals),
    projectId,
  };
}

function activeUserId(locals: App.Locals): string | null {
  const explicit = (locals as App.Locals & { userId?: string | null }).userId;
  if (explicit?.trim()) return explicit;
  const session = locals.session as { userId?: string | null } | null | undefined;
  return session?.userId?.trim() ? session.userId : null;
}

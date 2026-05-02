import type { Session } from "./entities/auth/index.ts";

export function getOrgId(session: Session): string {
  return session.activeOrganizationId ?? session.orgId;
}

export function getUserId(session: Session): string {
  return session.userId;
}

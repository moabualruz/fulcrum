import type { EntityManager } from "@mikro-orm/postgresql";

import { resolveOrgId } from "@identity-access/application/auth/org-context.ts";

export async function resolveDefaultOrgId(em: EntityManager): Promise<string> {
  return resolveOrgId(em, "default");
}

import type { EntityManager } from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";

export async function resolveOrgId(em: EntityManager, candidate: string | null | undefined): Promise<string> {
  if (candidate && candidate !== "default") return candidate;
  const org = await em.findOne(Org, { where: { id: DEFAULT_ORG_ID } as never });
  if (!org) throw new Error("default org not found");
  return org.id;
}

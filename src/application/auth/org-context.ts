import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "../../db/entities/auth/Org.ts";

export async function resolveOrgId(em: EntityManager, candidate: string | null | undefined): Promise<string> {
  if (candidate && candidate !== "default") return candidate;
  const org = await em.findOne(Org, { slug: "default" } as never);
  if (!org) throw new Error("default org not found");
  return org.id;
}

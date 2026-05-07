import type { EntityManager } from "@mikro-orm/postgresql";
import { Org } from "../../../../db/entities/auth/Org.ts";
import { initDatabase } from "./db.ts";

export async function requestEntityManager(): Promise<EntityManager> {
  const db = await initDatabase();
  return db.em.fork();
}

export async function resolveDefaultOrgId(em: EntityManager): Promise<string> {
  const org = await em.findOne(Org, { slug: "default" } as never);
  if (!org) throw new Error("default org not found — run fulcrum init first");
  return org.id;
}

export {
  requestEntityManager as get\u0045m,
  resolveDefaultOrgId as getDefaultOrgId\u004frm,
};

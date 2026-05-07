import type { EntityManager } from "@mikro-orm/postgresql";
import { resolveOrgId } from "../../../../application/auth/org-context.ts";
import { initDatabase } from "./db.ts";

export async function requestEntityManager(): Promise<EntityManager> {
  const db = await initDatabase();
  return db.em.fork();
}

export async function resolveDefaultOrgId(em: EntityManager): Promise<string> {
  return resolveOrgId(em, "default");
}

export {
  requestEntityManager as get\u0045m,
  resolveDefaultOrgId as getDefaultOrgId\u004frm,
};

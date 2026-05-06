/**
 * EntityManager provider for the web server layer.
 *
 * Replaces `openDatabase()` raw SQL access with MikroORM EntityManager.
 * Each request should call `getEm()` which returns a forked EM for isolation.
 *
 * ARCH-01: Single ORM layer replaces raw SQL.
 * ARCH-02: All DB access via repository/EM pattern.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { Org } from "../../../../db/entities/auth/Org.ts";
import { initOrm } from "../../../../db/mikro-orm.config.ts";

/**
 * Returns a forked EntityManager for request-scoped DB access.
 * The fork isolates the unit-of-work from other concurrent requests.
 */
export async function getEm(): Promise<EntityManager> {
  const orm = await initOrm();
  return orm.em.fork();
}

/**
 * Resolve the default org ID via EntityManager.
 * Mirror of `getDefaultOrgId(db)` from db.ts but using the ORM connection.
 */
export async function getDefaultOrgIdOrm(em: EntityManager): Promise<string> {
  const org = await em.findOne(Org, { slug: "default" } as never);
  if (!org) throw new Error("default org not found — run fulcrum init first");
  return org.id;
}

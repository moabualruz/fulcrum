/**
 * EntityManager provider for the web server layer.
 *
 * Replaces `openProductDb()` raw SQL access with MikroORM EntityManager.
 * Each request should call `getEm()` which returns a forked EM for isolation.
 *
 * ARCH-01: Single ORM layer replaces raw SQL.
 * ARCH-02: All DB access via repository/EM pattern.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
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
  const conn = em.getConnection();
  const rows = await conn.execute<{ id: string }[]>(
    `SELECT id FROM orgs WHERE slug = ?`,
    ["default"],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("default org not found — run fulcrum init first");
  return id;
}

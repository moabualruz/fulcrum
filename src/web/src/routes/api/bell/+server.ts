import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getEm, getDefaultOrgIdOrm } from "$lib/server/em";
import { countRecentNotifications } from "../../../../../application/notifications/queries.ts";

/** GET /api/bell — returns { count: number } of events in the last 24h. */
export const GET: RequestHandler = async ({ locals }) => {
  const em = await getEm();
  const orgId = locals.orgId ?? await getDefaultOrgIdOrm(em);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await countRecentNotifications(em, { orgId, userId: null }, { since });
  return json({ count });
};

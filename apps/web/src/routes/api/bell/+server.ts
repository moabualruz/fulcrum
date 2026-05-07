import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requestAppScope } from "$lib/server/application-scope";
import { countRecentNotifications } from "@/application/notifications/queries.ts";

/** GET /api/bell — returns { count: number } of events in the last 24h. */
export const GET: RequestHandler = async ({ locals }) => {
  const { em, ctx } = await requestAppScope(locals);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await countRecentNotifications(em, ctx, { since });
  return json({ count });
};

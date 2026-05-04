import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { openProductDb, getDefaultOrgId } from "$lib/server/db";

/** GET /api/bell — returns { count: number } of events in the last 24h. */
export const GET: RequestHandler = async () => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    const rows = await db.query<{ c: string | number }>(
      `SELECT count(*)::text AS c FROM events
         WHERE org_id = $1 AND created_at >= now() - interval '24 hours'`,
      [orgId],
    );
    const count = typeof rows[0]?.c === "number" ? rows[0].c : Number.parseInt(String(rows[0]?.c ?? "0"), 10);
    return json({ count });
  } finally {
    await db.close();
  }
};

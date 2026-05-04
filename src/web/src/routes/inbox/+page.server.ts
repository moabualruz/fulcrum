import type { ServerLoad, Actions } from "@sveltejs/kit";
import { openProductDb } from "$lib/server/db";

export interface NotificationRow {
  id: string;
  org_id: string;
  recipient: string;
  event_id: string | null;
  subject_kind: string;
  subject_id: string;
  verb: string;
  actor: string;
  read_at: string | null;
  created_at: string;
}

export interface ActivityRow {
  id: string;
  org_id: string;
  project_id: string | null;
  actor: string;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface InboxData {
  notifications: NotificationRow[];
  unreadCount: number;
  activity: ActivityRow[];
  activityPage: number;
  activityTotal: number;
}

const PAGE_SIZE = 20;

async function defaultOrgId(db: ReturnType<typeof openProductDb> extends Promise<infer T> ? T : never): Promise<string | null> {
  const rows = await (db as { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> }).query<{ id: string }>(
    `SELECT id FROM orgs WHERE slug = $1`,
    ["default"],
  );
  return rows[0]?.id ?? null;
}

export const load: ServerLoad = async ({ url }) => {
  const activityPageRaw = parseInt(url.searchParams.get("activity_page") ?? "1", 10);
  const activityPage = Number.isNaN(activityPageRaw) || activityPageRaw < 1 ? 1 : activityPageRaw;
  const offset = (activityPage - 1) * PAGE_SIZE;

  const db = await openProductDb();
  try {
    const orgId = await defaultOrgId(db as never);
    if (!orgId) {
      return {
        notifications: [],
        unreadCount: 0,
        activity: [],
        activityPage: 1,
        activityTotal: 0,
      } satisfies InboxData;
    }

    const notifications = await db.query<NotificationRow>(
      `SELECT id, org_id, recipient, event_id, subject_kind, subject_id, verb, actor, read_at, created_at
         FROM notifications
        WHERE org_id = $1 AND recipient = $2
        ORDER BY created_at DESC
        LIMIT 100`,
      [orgId, "local"],
    );

    const unreadCount = notifications.filter((n) => n.read_at === null).length;

    const activityCountRows = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM events WHERE org_id = $1 AND actor = $2`,
      [orgId, "local"],
    );
    const activityTotal = parseInt(activityCountRows[0]?.count ?? "0", 10);

    const activity = await db.query<ActivityRow>(
      `SELECT id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at
         FROM events
        WHERE org_id = $1 AND actor = $2
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4`,
      [orgId, "local", PAGE_SIZE, offset],
    );

    return {
      notifications,
      unreadCount,
      activity,
      activityPage,
      activityTotal,
    } satisfies InboxData;
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  markAllRead: async () => {
    const db = await openProductDb();
    try {
      const rows = await db.query<{ id: string }>(`SELECT id FROM orgs WHERE slug = $1`, ["default"]);
      const orgId = rows[0]?.id;
      if (!orgId) return { error: "no org" };

      await db.query(
        `UPDATE notifications SET read_at = now()
          WHERE org_id = $1 AND recipient = $2 AND read_at IS NULL`,
        [orgId, "local"],
      );
      return { markedRead: true };
    } finally {
      await db.close();
    }
  },
};

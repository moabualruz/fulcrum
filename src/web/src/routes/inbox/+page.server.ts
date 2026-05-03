import type { PageServerLoad } from "./$types";
import { openProductDb } from "$lib/server/db";
import { getDefaultOrgId } from "$lib/server/db";
import {
  listNotifications,
  countUnreadNotifications,
  listEventsByActor,
} from "../../../../product-kernel/store/repositories.ts";

const DEFAULT_USER = "admin@local";

export const load: PageServerLoad = ({ url, locals }) => {
  const tab = url.searchParams.get("tab") ?? "notifications";

  return {
    activeProjectId: locals?.activeProjectId ?? null,
    tab,
    streamed: {
      data: (async () => {
        const db = await openProductDb();
        try {
          if (tab === "activity") {
            const events = await listEventsByActor(db, DEFAULT_USER, { limit: 20 });
            return { events };
          }
          // Default: notifications tab
          const notifications = await listNotifications(db, DEFAULT_USER, { limit: 20 });
          const unreadCount = await countUnreadNotifications(db, DEFAULT_USER);
          return { notifications, unreadCount };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};

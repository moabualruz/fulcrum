import { describe, expect, test } from "bun:test";

import { load } from "./+page.server.ts";

function makeEvent(fetchImpl: typeof fetch, url = "http://localhost/inbox") {
  return {
    locals: { session: { user: "u" }, orgId: "org-1", userId: "user-1" },
    url: new URL(url),
    request: new Request(url, {
      headers: { cookie: "sid=session-1" },
    }),
    fetch: fetchImpl,
  };
}

describe("/inbox +page.server.ts public data loading", () => {
  test("load returns notifications for the current user", async () => {
    const result = await load(makeEvent(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("/unread-count")) return Response.json({ count: 3 });
      if (target.includes("/api/v1/audit")) return Response.json({ data: [], total: 0 });
      return Response.json({
        data: Array.from({ length: 3 }, (_, index) => ({
          id: `notification-${index}`,
          orgId: "org-1",
          userId: "user-1",
          ruleId: null,
          eventId: `event-${index}`,
          title: `Notification ${index}`,
          body: "assigned",
          entityKind: "task",
          entityId: `task-${index}`,
          read: false,
          readAt: null,
          createdAt: "2026-05-14T00:00:00.000Z",
        })),
      });
    }) as never);

    expect(result.notifications.length).toBe(3);
    expect(result.unreadCount).toBe(3);
  });

  test("load returns current-user audit events for the activity tab", async () => {
    const result = await load(makeEvent(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("/unread-count")) return Response.json({ count: 0 });
      if (target.includes("/api/v1/notifications?")) return Response.json({ data: [] });
      return Response.json({
        data: [
          {
            id: "event-1",
            orgId: "org-1",
            projectId: null,
            userId: "user-1",
            verb: "created",
            subjectKind: "task",
            subjectId: "task-1",
            payload: {},
            createdAt: "2026-05-14T00:00:00.000Z",
          },
        ],
        total: 1,
      });
    }, "http://localhost/inbox?tab=activity") as never);

    expect(result.activity.length).toBe(1);
    expect(result.activity[0]!.actor).toBe("user-1");
  });
});

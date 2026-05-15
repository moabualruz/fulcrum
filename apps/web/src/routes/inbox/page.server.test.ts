import { describe, expect, test } from "bun:test";

import { actions, load } from "./+page.server.ts";

interface MockEventInput {
  url?: string;
  fetchImpl: typeof fetch;
}

function makeEvent(input: MockEventInput) {
  return {
    locals: { session: { user: "u" }, orgId: "org-1", userId: "user-1" },
    url: new URL(input.url ?? "http://localhost/inbox"),
    request: new Request("http://localhost/inbox", {
      headers: { cookie: "sid=session-1" },
    }),
    fetch: input.fetchImpl,
  };
}

describe("/inbox +page.server.ts load()", () => {
  test("returns empty inbox through same-host public APIs when no data exists", async () => {
    const calls: string[] = [];
    const result = await load(makeEvent({
      fetchImpl: async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("/api/trpc")) throw new Error("unexpected local bridge call");
        calls.push(target);
        if (target.includes("/unread-count")) return Response.json({ count: 0 });
        return Response.json({ data: [], total: 0 });
      },
    }) as never);

    expect(result.notifications).toHaveLength(0);
    expect(result.unreadCount).toBe(0);
    expect(result.activity).toHaveLength(0);
    expect(calls.sort()).toEqual([
      "http://localhost/api/v1/audit?orgId=org-1&userId=user-1&limit=20&offset=0",
      "http://localhost/api/v1/notifications/unread-count?orgId=org-1&userId=user-1",
      "http://localhost/api/v1/notifications?orgId=org-1&userId=user-1",
    ].sort());
  });

  test("counts unread notifications and normalizes notification rows", async () => {
    const result = await load(makeEvent({
      fetchImpl: async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("/unread-count")) return Response.json({ count: 1 });
        if (target.includes("/api/v1/audit")) return Response.json({ data: [], total: 0 });
        return Response.json({
          data: [
            {
              id: "notification-1",
              orgId: "org-1",
              userId: "user-1",
              ruleId: null,
              eventId: "event-1",
              title: "system",
              body: "created",
              entityKind: "task",
              entityId: "task-1",
              read: false,
              readAt: null,
              createdAt: "2026-04-01T00:00:00.000Z",
            },
            {
              id: "notification-2",
              orgId: "org-1",
              userId: "user-1",
              ruleId: null,
              eventId: "event-2",
              title: "system",
              body: "updated",
              entityKind: "task",
              entityId: "task-2",
              read: true,
              readAt: "2026-04-01T01:00:00.000Z",
              createdAt: "2026-04-01T00:05:00.000Z",
            },
          ],
        });
      },
    }) as never);

    expect(result.unreadCount).toBe(1);
    expect(result.notifications).toHaveLength(2);
    expect(result.notifications[0]).toMatchObject({
      id: "notification-1",
      title: "system",
      body: "created",
      entityKind: "task",
      entityId: "task-1",
      readAt: null,
    });
  });

  test("loads activity through the public audit API with pagination", async () => {
    const result = await load(makeEvent({
      url: "http://localhost/inbox?activity_page=2",
      fetchImpl: async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes("/unread-count")) return Response.json({ count: 0 });
        if (target.includes("/api/v1/notifications?")) return Response.json({ data: [] });
        expect(target).toBe("http://localhost/api/v1/audit?orgId=org-1&userId=user-1&limit=20&offset=20");
        return Response.json({
          data: [
            {
              id: "event-21",
              orgId: "org-1",
              projectId: "project-1",
              userId: "user-1",
              verb: "created",
              subjectKind: "task",
              subjectId: "task-21",
              payload: { tab: "activity" },
              createdAt: "2026-04-01T00:00:00.000Z",
            },
          ],
          total: 21,
        });
      },
    }) as never);

    expect(result.activity).toEqual([
      {
        id: "event-21",
        org_id: "org-1",
        project_id: "project-1",
        actor: "user-1",
        subject_kind: "task",
        subject_id: "task-21",
        verb: "created",
        payload: { tab: "activity" },
        created_at: "2026-04-01T00:00:00.000Z",
      },
    ]);
    expect(result.activityPage).toBe(2);
    expect(result.activityTotal).toBe(21);
  });
});

describe("/inbox +page.server.ts actions.markAllRead()", () => {
  test("marks all unread notifications read through the public API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await actions.markAllRead(makeEvent({
      fetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({ count: 2 });
      },
    }) as never);

    expect(result).toEqual({ markedRead: true });
    expect(calls).toEqual([
      {
        url: "http://localhost/api/v1/notifications/mark-all-read?orgId=org-1&userId=user-1",
        init: {
          method: "PATCH",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            cookie: "sid=session-1",
          },
        },
      },
    ]);
  });
});

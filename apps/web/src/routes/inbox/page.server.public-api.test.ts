import { afterEach, describe, expect, test } from "bun:test";

import { actions, load } from "./+page.server.ts";

const originalServerUrl = process.env["FULCRUM_SERVER_URL"];
const originalPublicApiUrl = process.env["FULCRUM_PUBLIC_API_URL"];

afterEach(() => {
  if (originalServerUrl === undefined) delete process.env["FULCRUM_SERVER_URL"];
  else process.env["FULCRUM_SERVER_URL"] = originalServerUrl;
  if (originalPublicApiUrl === undefined) delete process.env["FULCRUM_PUBLIC_API_URL"];
  else process.env["FULCRUM_PUBLIC_API_URL"] = originalPublicApiUrl;
});

function makeEvent(fetchImpl: typeof fetch) {
  return {
    locals: { session: { user: "u" }, orgId: "org-1", userId: "user-1" },
    url: new URL("http://localhost/inbox?activity_page=2"),
    request: new Request("http://localhost/inbox", {
      headers: { cookie: "sid=session-1" },
    }),
    fetch: fetchImpl,
  };
}

describe("/inbox public notification API transport", () => {
  test("loads unread counts and notification rows from the Nest public API", async () => {
    process.env["FULCRUM_SERVER_URL"] = "http://127.0.0.1:3210/";
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await load(makeEvent(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/api/trpc")) throw new Error("unexpected local bridge call");
      calls.push({ url: target, init: init ?? {} });
      if (target.includes("/unread-count")) return Response.json({ count: 2 });
      if (target.includes("/notifications/rules")) {
        return Response.json([{ id: "rule-1", name: "Workflow blockers", enabled: true, channels: ["in-app"] }]);
      }
      if (target.includes("/api/v1/audit")) {
        return Response.json({
          data: [
            {
              id: "event-1",
              orgId: "org-1",
              projectId: null,
              userId: "user-1",
              verb: "reviewed",
              subjectKind: "task",
              subjectId: "task-1",
              payload: { source: "inbox" },
              traceId: "trace-1",
              createdAt: "2026-05-14T09:00:00.000Z",
            },
          ],
          total: 1,
        });
      }
      return Response.json({
        data: [
          {
            id: "notification-1",
            orgId: "org-1",
            userId: "user-1",
            ruleId: null,
            eventId: "event-1",
            title: "Build ready",
            body: "The prototype is ready for review.",
            entityKind: "task",
            entityId: "task-1",
            read: false,
            readAt: null,
            createdAt: "2026-05-14T10:00:00.000Z",
          },
        ],
      });
    }) as never);

    expect(result).toMatchObject({
      unreadCount: 2,
      activityPage: 2,
      activityTotal: 1,
    });
    expect(result.activity).toEqual([
      {
        id: "event-1",
        org_id: "org-1",
        project_id: null,
        actor: "user-1",
        subject_kind: "task",
        subject_id: "task-1",
        verb: "reviewed",
        payload: { source: "inbox" },
        created_at: "2026-05-14T09:00:00.000Z",
      },
    ]);
    expect(result.notifications).toEqual([
      {
        id: "notification-1",
        orgId: "org-1",
        userId: "user-1",
        ruleId: null,
        eventId: "event-1",
        title: "Build ready",
        body: "The prototype is ready for review.",
        entityKind: "task",
        entityId: "task-1",
        read: false,
        readAt: null,
        createdAt: "2026-05-14T10:00:00.000Z",
        evidenceHref: "/search?q=task%3Atask-1",
        evidenceLabel: "task:task-1",
      },
    ]);
    expect(result.notificationRules).toEqual([
      { id: "rule-1", name: "Workflow blockers", enabled: true, channels: ["in-app"] },
    ]);
    expect(calls.map((call) => call.url).sort()).toEqual([
      "http://127.0.0.1:3210/api/v1/audit?orgId=org-1&userId=user-1&limit=20&offset=20",
      "http://127.0.0.1:3210/api/v1/notifications/unread-count?orgId=org-1&userId=user-1",
      "http://127.0.0.1:3210/api/v1/notifications/rules?orgId=org-1&userId=user-1",
      "http://127.0.0.1:3210/api/v1/notifications?orgId=org-1&userId=user-1",
    ].sort());
    for (const call of calls) {
      expect(call.init).toMatchObject({
        method: "GET",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          cookie: "sid=session-1",
        },
      });
    }
  });

  test("defaults to same-host public API when no external API URL is configured", async () => {
    delete process.env["FULCRUM_SERVER_URL"];
    delete process.env["FULCRUM_PUBLIC_API_URL"];
    const calls: string[] = [];

    await load(makeEvent(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("/api/trpc")) throw new Error("unexpected local bridge call");
      calls.push(target);
      if (target.includes("/unread-count")) return Response.json({ count: 0 });
      if (target.includes("/notifications/rules")) return Response.json([]);
      return Response.json({ data: [], total: 0 });
    }) as never);

    expect(calls.sort()).toEqual([
      "http://localhost/api/v1/audit?orgId=org-1&userId=user-1&limit=20&offset=20",
      "http://localhost/api/v1/notifications/unread-count?orgId=org-1&userId=user-1",
      "http://localhost/api/v1/notifications/rules?orgId=org-1&userId=user-1",
      "http://localhost/api/v1/notifications?orgId=org-1&userId=user-1",
    ].sort());
  });

  test("marks all notifications read through the Nest public API", async () => {
    process.env["FULCRUM_PUBLIC_API_URL"] = "http://127.0.0.1:4321/api-base/";
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await actions.markAllRead(makeEvent(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/api/trpc")) throw new Error("unexpected local bridge call");
      calls.push({ url: target, init: init ?? {} });
      return Response.json({ count: 0 });
    }) as never);

    expect(result).toEqual({ markedRead: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      url: "http://127.0.0.1:4321/api/v1/notifications/mark-all-read?orgId=org-1&userId=user-1",
      init: {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          cookie: "sid=session-1",
        },
      },
    });
  });
});

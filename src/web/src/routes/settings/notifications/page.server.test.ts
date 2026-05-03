import { describe, expect, test } from "bun:test";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ result: { data: { json: data } } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeFetch(calls: Array<{ url: string; init?: RequestInit }>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/api/trpc/notify.rules.list")) {
      return jsonResponse([
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "assignment-to-me",
          eventPattern: { subject_kind: "task", verb: "assigned" },
          channels: ["in-app"],
          enabled: true,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "mention-of-me",
          eventPattern: { subject_kind: "comment", verb: "mentioned" },
          channels: ["in-app", "email"],
          enabled: true,
        },
      ]);
    }
    if (url.includes("/api/trpc/notify.quietHours.get")) {
      return jsonResponse({
        tz: "Europe/Berlin",
        startHour: 22,
        endHour: 7,
        daysOfWeek: [1, 2, 3, 4, 5],
      });
    }
    if (url.includes("/api/trpc/notify.channels.list")) {
      return jsonResponse([
        { name: "in-app", enabled: true, configurable: false },
        { name: "email", enabled: true, configurable: true },
        { name: "webhook", enabled: false, configurable: true },
      ]);
    }
    if (url.includes("/api/trpc/notify.mutes.list")) {
      return jsonResponse([
        {
          id: "33333333-3333-4333-8333-333333333333",
          subjectKind: "task",
          subjectId: "44444444-4444-4444-8444-444444444444",
          mutedUntil: null,
        },
      ]);
    }
    return jsonResponse({ ok: true });
  };
}

describe("/settings/notifications +page.server", () => {
  test("load aggregates notification settings via notify tRPC procedures", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const { load } = await import("./+page.server.ts");

    const result = await load({
      locals: { session: { user: { id: "user1" } } },
      fetch: makeFetch(calls),
      request: { headers: new Headers({ cookie: "sid=test" }) },
      url: new URL("http://localhost/settings/notifications"),
    } as any);

    expect(result.rules.map((rule: { name: string }) => rule.name)).toEqual([
      "assignment-to-me",
      "mention-of-me",
    ]);
    expect(result.quietHours.tz).toBe("Europe/Berlin");
    expect(result.channels.map((channel: { name: string }) => channel.name)).toContain("email");
    expect(result.mutes[0]!.subjectKind).toBe("task");
    expect(calls.map((call) => call.url)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/api/trpc/notify.rules.list"),
        expect.stringContaining("/api/trpc/notify.quietHours.get"),
        expect.stringContaining("/api/trpc/notify.channels.list"),
        expect.stringContaining("/api/trpc/notify.mutes.list"),
      ]),
    );
  });

  test("createRule action posts normalized pattern and keeps in-app channel enabled", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const { actions } = await import("./+page.server.ts");
    const form = new FormData();
    form.set("name", "Task comments");
    form.set("subjectKind", "task");
    form.set("verb", "commented");
    form.set("payloadPath", "assignee_id");
    form.set("payloadValue", "$current_user_id");
    form.set("channels", "email");

    await actions.createRule({
      locals: { session: { user: { id: "user1" } } },
      fetch: makeFetch(calls),
      request: { headers: new Headers({ cookie: "sid=test" }), formData: async () => form },
      url: new URL("http://localhost/settings/notifications"),
    } as any);

    const mutation = calls.find((call) => call.url.includes("/api/trpc/notify.rules.create"));
    expect(mutation).toBeDefined();
    const body = JSON.parse(String(mutation!.init!.body));
    expect(body.json).toEqual({
      name: "Task comments",
      subjectKind: "task",
      eventPattern: {
        subject_kind: "task",
        verb: "commented",
        payload_path_eq: [{ path: "assignee_id", value: "$current_user_id" }],
      },
      channels: ["in-app", "email"],
      enabled: true,
    });
  });
});

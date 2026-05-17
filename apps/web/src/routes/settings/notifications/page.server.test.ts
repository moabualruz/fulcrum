import { describe, expect, test } from "bun:test";

type RouteEvent = Parameters<typeof import("./+page.server.ts").load>[0];

interface FetchCall {
  url: string;
  method: string;
  cookie: string | null;
  body: string | null;
}

function routeEvent(fetchImpl: typeof fetch, input: {
  orgId?: string | null;
  cookie?: string;
  form?: FormData;
} = {}): RouteEvent {
  const url = new URL("http://localhost/settings/notifications");
  return {
    locals: {
      orgId: input.orgId ?? "org-1",
      activeProjectId: null,
    },
    url,
    fetch: fetchImpl,
    request: new Request(url, {
      method: input.form ? "POST" : "GET",
      headers: input.cookie ? { cookie: input.cookie } : undefined,
      body: input.form,
    }),
  } as unknown as RouteEvent;
}

function retentionFetch(calls: FetchCall[], response: Record<string, unknown> | null = { retainDays: 30 }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: input.toString(),
      method: init?.method ?? "GET",
      cookie: new Headers(init?.headers).get("cookie"),
      body: typeof init?.body === "string" ? init.body : null,
    });
    return Response.json(response);
  }) as typeof fetch;
}

describe("/settings/notifications retention policy", () => {
  test("load reads retention policy through the audit public API", async () => {
    const calls: FetchCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);

    const result = await mod.load(routeEvent(retentionFetch(calls), { cookie: "sid=notify" }));

    expect(result).toEqual({ retainDays: 30, saved: false });
    expect(calls).toEqual([
      {
        url: "http://localhost/api/v1/audit/retention-policy?orgId=org-1",
        method: "GET",
        cookie: "sid=notify",
        body: null,
      },
    ]);
  });

  test("load accepts snake_case retain_days from older API responses", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);

    const result = await mod.load(routeEvent(retentionFetch([], { retain_days: 45 })));

    expect(result).toEqual({ retainDays: 45, saved: false });
  });

  test("save writes sanitized retainDays through the audit public API", async () => {
    const calls: FetchCall[] = [];
    const form = new FormData();
    form.set("retain_days", "90");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);

    const result = await mod.actions.retention(routeEvent(retentionFetch(calls, { retainDays: 90 }), {
      form,
      orgId: "org-2",
      cookie: "sid=save",
    }) as Parameters<typeof mod.actions.retention>[0]);

    expect(result).toEqual({ retainDays: 90, saved: true });
    expect(calls).toEqual([
      {
        url: "http://localhost/api/v1/audit/retention-policy?orgId=org-2",
        method: "PATCH",
        cookie: "sid=save",
        body: JSON.stringify({ retainDays: 90 }),
      },
    ]);
  });

  test("save treats invalid retain_days as keep-forever", async () => {
    const calls: FetchCall[] = [];
    const form = new FormData();
    form.set("retain_days", "not-a-number");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);

    const result = await mod.actions.retention(routeEvent(retentionFetch(calls, { retainDays: 0 }), {
      form,
    }) as Parameters<typeof mod.actions.retention>[0]);

    expect(result).toEqual({ retainDays: 0, saved: true });
    expect(calls[0]?.body).toBe(JSON.stringify({ retainDays: 0 }));
  });
});

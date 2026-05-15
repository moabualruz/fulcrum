import { describe, expect, test } from "bun:test";

type LoadEvent = Parameters<typeof import("./+page.server.ts").load>[0];

interface FetchCall {
  url: string;
  method: string;
  cookie: string | null;
  body: string | null;
}

interface ConnectorFixture {
  id?: string;
  enabled?: boolean;
}

function routeEvent(fetchImpl: typeof fetch, input: {
  form?: FormData;
  orgId?: string | null;
  cookie?: string;
  session?: unknown;
} = {}): LoadEvent {
  const url = new URL("http://localhost/settings/connectors");
  return {
    locals: {
      orgId: input.orgId ?? "org-1",
      activeProjectId: null,
      session: input.session === undefined ? { userId: "u1" } : input.session,
    },
    url,
    fetch: fetchImpl,
    request: new Request(url, {
      method: input.form ? "POST" : "GET",
      headers: input.cookie ? { cookie: input.cookie } : undefined,
      body: input.form,
    }),
  } as unknown as LoadEvent;
}

function connectorFetch(calls: FetchCall[], fixture: ConnectorFixture = {}): typeof fetch {
  const connectorId = fixture.id ?? "confluence";
  const enabled = fixture.enabled ?? true;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      cookie: new Headers(init?.headers).get("cookie"),
      body: typeof init?.body === "string" ? init.body : null,
    });

    if (method === "GET" && url === "http://localhost/api/v1/connectors?orgId=org-1") {
      return Response.json([
        { name: connectorId, enabled, config: enabled ? { host: "https://example.test" } : {} },
        { name: "notion", enabled: false, config: {} },
      ]);
    }
    if (method === "GET" && url === "http://localhost/api/v1/connector-runs?orgId=org-1") {
      return Response.json([
        {
          id: "run-1",
          connectorId,
          status: "queued",
          summary: { message: "Connector sync request recorded for the execution queue." },
          createdAt: "2026-05-15T00:00:00.000Z",
        },
      ]);
    }
    if (method === "GET" && url === `http://localhost/api/v1/connectors/${connectorId}?orgId=org-1`) {
      return Response.json({ name: connectorId, enabled, config: {} });
    }
    if (method === "POST" && url === `http://localhost/api/v1/connectors/${connectorId}/enable`) {
      return Response.json({ name: connectorId, enabled: true, config: { host: "https://example.test" } });
    }
    if (method === "POST" && url === `http://localhost/api/v1/connectors/${connectorId}/sync`) {
      return Response.json({ id: "run-2", connectorId, status: "queued" }, { status: 202 });
    }
    return Response.json({ message: `unexpected ${method} ${url}` }, { status: 500 });
  }) as typeof fetch;
}

function connectorForm(name = "confluence", fields: Record<string, string> = {}) {
  const form = new FormData();
  form.set("name", name);
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  return form;
}

describe("/settings/connectors", () => {
  test("redirects when no session exists", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);

    await expect(
      mod.load(routeEvent(connectorFetch([]), { session: null })),
    ).rejects.toMatchObject({ status: 302, location: "/auth/login" });
  });

  test("load reads connector descriptors and sync runs through the public API", async () => {
    const calls: FetchCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);

    const result = await mod.load(routeEvent(connectorFetch(calls), { cookie: "sid=connectors" })) as {
      connectors: Array<{ name: string; enabled: boolean }>;
      syncLog: Array<{ id: string; connectorName: string; message: string; startedAt: string }>;
    };

    expect(result.connectors.map((connector) => connector.name)).toEqual(["confluence", "notion"]);
    expect(result.connectors[0]?.enabled).toBe(true);
    expect(result.syncLog).toEqual([
      {
        id: "run-1",
        connectorName: "confluence",
        status: "queued",
        message: "Connector sync request recorded for the execution queue.",
        startedAt: "2026-05-15T00:00:00.000Z",
      },
    ]);
    expect(calls.map((call) => `${call.method} ${call.url} ${call.cookie}`)).toEqual([
      "GET http://localhost/api/v1/connectors?orgId=org-1 sid=connectors",
      "GET http://localhost/api/v1/connector-runs?orgId=org-1 sid=connectors",
    ]);
  });

  test("save stores connector config through the public API", async () => {
    const calls: FetchCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);

    const result = await mod.actions.save(routeEvent(connectorFetch(calls), {
      form: connectorForm("confluence", {
        host: "https://acme.atlassian.net",
        email: "user@example.test",
        token: "secret-token",
      }),
    }) as Parameters<typeof mod.actions.save>[0]);

    expect(result).toEqual({ saveOk: true, name: "confluence" });
    expect(calls.at(-1)).toMatchObject({
      url: "http://localhost/api/v1/connectors/confluence/enable",
      method: "POST",
    });
    expect(JSON.parse(calls.at(-1)?.body ?? "{}")).toEqual({
      orgId: "org-1",
      config: {
        host: "https://acme.atlassian.net",
        email: "user@example.test",
        token: "secret-token",
      },
    });
  });

  test("save preserves disabled connector guard before writing config", async () => {
    const calls: FetchCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);

    await expect(
      mod.actions.save(routeEvent(connectorFetch(calls, { enabled: false }), {
        form: connectorForm("confluence", { host: "https://example.test", token: "token" }),
      }) as Parameters<typeof mod.actions.save>[0]),
    ).rejects.toMatchObject({ status: 403 });

    expect(calls.map((call) => call.method)).toEqual(["GET"]);
  });

  test("save validates required config fields", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);

    const result = await mod.actions.save(routeEvent(connectorFetch([]), {
      form: connectorForm("confluence", { token: "token" }),
    }) as Parameters<typeof mod.actions.save>[0]) as { status?: number };

    expect(result.status).toBe(400);
  });

  test("sync queues a connector run through the public API", async () => {
    const calls: FetchCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);

    const result = await mod.actions.sync(routeEvent(connectorFetch(calls), {
      form: connectorForm("confluence"),
    }) as Parameters<typeof mod.actions.sync>[0]);

    expect(result).toEqual({ syncOk: true, name: "confluence" });
    expect(calls.at(-1)).toMatchObject({
      url: "http://localhost/api/v1/connectors/confluence/sync",
      method: "POST",
    });
    expect(JSON.parse(calls.at(-1)?.body ?? "{}")).toEqual({ orgId: "org-1", trigger: "manual" });
  });

  test("unknown connector names fail before the public API is called", async () => {
    const calls: FetchCall[] = [];
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 6}`);

    const result = await mod.actions.sync(routeEvent(connectorFetch(calls), {
      form: connectorForm("unknown"),
    }) as Parameters<typeof mod.actions.sync>[0]) as { status?: number };

    expect(result.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
